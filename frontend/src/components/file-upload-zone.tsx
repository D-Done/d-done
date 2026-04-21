"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  XCircle,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { uploadFile, type UploadProgress } from "@/lib/gcs-upload";
import type { DocumentType } from "@/lib/types";
import { DOC_TYPE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type FileUploadStatus = "pending" | "uploading" | "complete" | "error";

/**
 * A folder in the project.
 * `path` is the slash-separated full path, e.g. "Agreements/IT and software".
 * The display name is the last path segment.
 */
export interface FolderEntry {
  path: string;
}

export interface FileEntry {
  file: File;
  /** Full folder path this file belongs to, e.g. "Agreements/IT and software". */
  folder?: string;
  docType: DocumentType;
  status: FileUploadStatus;
  progress: number;
  error?: string;
  fileId?: string;
  gcsUri?: string;
}

export interface FileUploadZoneProps {
  files: FileEntry[];
  onFilesChange: (files: FileEntry[]) => void;
  isUploading?: boolean;
  maxFiles?: number;
  acceptedTypes?: string[];
  acceptLabel?: string;
  showDocTypeSelector?: boolean;
  showOverallProgress?: boolean;
  showFolders?: boolean;
  folders?: FolderEntry[];
  onFoldersChange?: (folders: FolderEntry[]) => void;
}

// ── MIME / extension helpers ───────────────────────────────────────────────

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
  gif: "image/gif",
};

function resolveMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export const ALL_ACCEPTED_TYPES = [
  ...Object.values(EXT_TO_MIME),
  "application/octet-stream",
];

const DEFAULT_ACCEPTED_TYPES = ALL_ACCEPTED_TYPES;
const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocumentType[];

function buildAcceptAttr(acceptedTypes: string[]): string {
  return [
    ...acceptedTypes,
    ...Object.keys(EXT_TO_MIME).map((e) => `.${e}`),
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(",");
}

// ── Folder tree helpers ────────────────────────────────────────────────────

interface TreeNode {
  path: string;
  name: string;
  children: TreeNode[];
  directCount: number;  // files directly in this folder
  totalCount: number;   // files in this folder + all descendants
}

function buildTree(folders: FolderEntry[], files: FileEntry[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();

  for (const f of folders) {
    const segs = f.path.split("/");
    nodeMap.set(f.path, {
      path: f.path,
      name: segs[segs.length - 1],
      children: [],
      directCount: files.filter((fi) => fi.folder === f.path).length,
      totalCount: 0,
    });
  }

  const roots: TreeNode[] = [];
  // Sort so parent paths come before children
  const sorted = [...nodeMap.keys()].sort();
  for (const path of sorted) {
    const node = nodeMap.get(path)!;
    const segs = path.split("/");
    if (segs.length === 1) {
      roots.push(node);
    } else {
      const parentPath = segs.slice(0, -1).join("/");
      const parent = nodeMap.get(parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node); // orphaned node — show at root
    }
  }

  function calcTotal(node: TreeNode): number {
    let t = node.directCount;
    for (const c of node.children) t += calcTotal(c);
    node.totalCount = t;
    return t;
  }
  roots.forEach(calcTotal);

  return roots.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

// ── Async folder reading via FileSystem API ────────────────────────────────

interface DroppedItem {
  file: File;
  folderPath: string | undefined;
}

async function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej),
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function traverseEntry(
  entry: FileSystemEntry,
  parentPath: string,
  result: DroppedItem[],
  folderPaths: Set<string>,
): Promise<void> {
  if (entry.isFile) {
    try {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      );
      result.push({ file, folderPath: parentPath || undefined });
    } catch {
      // Some OS / browser combinations block reading individual file metadata
      // from dropped directories. Skip silently — don't abort the whole tree.
      console.warn("[FileUpload] Could not read file entry:", entry.name);
    }
  } else if (entry.isDirectory) {
    const dirPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    // Register every ancestor path so the tree is complete
    dirPath.split("/").forEach((_, i, arr) =>
      folderPaths.add(arr.slice(0, i + 1).join("/")),
    );
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    console.debug("[FileUpload] dir", dirPath, "→", children.length, "children");
    for (const child of children) {
      await traverseEntry(child, dirPath, result, folderPaths);
    }
  }
}

/**
 * Collect FileSystemEntry objects synchronously (must happen inside the
 * event handler before React pools the event), then traverse asynchronously.
 */
function collectEntries(dataTransfer: DataTransfer): FileSystemEntry[] {
  return Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
}

async function resolveEntries(
  entries: FileSystemEntry[],
  basePath = "",
): Promise<{ items: DroppedItem[]; folderPaths: Set<string> }> {
  const items: DroppedItem[] = [];
  const folderPaths = new Set<string>();

  for (const entry of entries) {
    if (entry.isDirectory) {
      const topPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      // Register every ancestor (including basePath segments) so the tree is complete
      topPath.split("/").forEach((_, i, arr) =>
        folderPaths.add(arr.slice(0, i + 1).join("/")),
      );
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await readAllEntries(reader);
      console.debug("[FileUpload] top-level dir", topPath, "→", children.length, "children");
      for (const child of children) {
        await traverseEntry(child, topPath, items, folderPaths);
      }
    } else if (entry.isFile) {
      try {
        const file = await new Promise<File>((res, rej) =>
          (entry as FileSystemFileEntry).file(res, rej),
        );
        items.push({ file, folderPath: basePath || undefined });
      } catch {
        console.warn("[FileUpload] Could not read top-level file:", entry.name);
      }
    }
  }
  return { items, folderPaths };
}

/** Handle <input webkitdirectory> — files carry webkitRelativePath. */
function parseWebkitDirectory(fileList: FileList): {
  items: DroppedItem[];
  folderPaths: Set<string>;
} {
  const items: DroppedItem[] = [];
  const folderPaths = new Set<string>();

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const rel = (file as File & { webkitRelativePath?: string })
      .webkitRelativePath;
    if (rel) {
      const segs = rel.split("/");
      // Register every ancestor folder
      for (let j = 1; j < segs.length; j++) {
        folderPaths.add(segs.slice(0, j).join("/"));
      }
      const folderPath = segs.slice(0, -1).join("/") || undefined;
      items.push({ file, folderPath });
    } else {
      items.push({ file, folderPath: undefined });
    }
  }
  return { items, folderPaths };
}

// ── Folder mutations ───────────────────────────────────────────────────────

function renameFolderPaths(
  folders: FolderEntry[],
  oldPath: string,
  newPath: string,
): FolderEntry[] {
  return folders.map((f) => {
    if (f.path === oldPath) return { path: newPath };
    if (f.path.startsWith(oldPath + "/"))
      return { path: newPath + f.path.slice(oldPath.length) };
    return f;
  });
}

function renameFileFolders(
  files: FileEntry[],
  oldPath: string,
  newPath: string,
): FileEntry[] {
  return files.map((f) => {
    if (f.folder === oldPath) return { ...f, folder: newPath };
    if (f.folder?.startsWith(oldPath + "/"))
      return { ...f, folder: newPath + f.folder.slice(oldPath.length) };
    return f;
  });
}

function parentPath(path: string): string | undefined {
  const segs = path.split("/");
  return segs.length > 1 ? segs.slice(0, -1).join("/") : undefined;
}

// ── Status helpers ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FileUploadStatus }) {
  switch (status) {
    case "uploading":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "complete":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <FileUp className="h-4 w-4 text-muted-foreground" />;
  }
}

function progressClass(status: FileUploadStatus): string {
  if (status === "complete")
    return "[&>[data-slot=progress-indicator]]:bg-green-600";
  if (status === "error")
    return "[&>[data-slot=progress-indicator]]:bg-destructive";
  return "";
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main component ─────────────────────────────────────────────────────────

export function FileUploadZone({
  files,
  onFilesChange,
  isUploading = false,
  maxFiles = 500,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  acceptLabel = "PDF",
  showDocTypeSelector = true,
  showOverallProgress = false,
  showFolders = false,
  folders = [],
  onFoldersChange,
}: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [isTraversing, setIsTraversing] = useState(false);

  // Set webkitdirectory attribute imperatively (not a standard React prop)
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("mozdirectory", "");
    }
  }, []);

  const acceptAttr = buildAcceptAttr(acceptedTypes);

  // Computed
  const completedCount = files.filter((f) => f.status === "complete").length;
  const hasErrors = files.some((f) => f.status === "error");
  const totalProgress =
    files.length > 0
      ? Math.round(
          files.reduce((s, f) => s + f.progress, 0) / files.length,
        )
      : 0;

  const tree = buildTree(folders, files);
  const activeFiles =
    activeFolder === null
      ? files
      : files.filter((f) => f.folder === activeFolder);

  // ── File / folder insertion helpers ──────────────────────────────────────

  /** Merge new folder paths into existing folders (dedup). */
  const mergeFolders = useCallback(
    (newPaths: Set<string>) => {
      const additions = [...newPaths]
        .filter((p) => !folders.some((f) => f.path === p))
        .map((path) => ({ path }));
      if (additions.length) onFoldersChange?.([...folders, ...additions]);
    },
    [folders, onFoldersChange],
  );

  /** Add file entries, respecting maxFiles. */
  const addFileEntries = useCallback(
    (items: DroppedItem[]) => {
      const accepted = items.filter((it) =>
        acceptedTypes.includes(resolveMime(it.file)),
      );
      if (accepted.length === 0) {
        toast.error("סוג הקובץ אינו נתמך");
        return;
      }
      if (files.length + accepted.length > maxFiles) {
        toast.error(`ניתן להעלות עד ${maxFiles} קבצים`);
        return;
      }
      onFilesChange([
        ...files,
        ...accepted.map(
          ({ file, folderPath }): FileEntry => ({
            file,
            folder: folderPath,
            docType: "other" as DocumentType,
            status: "pending",
            progress: 0,
          }),
        ),
      ]);
    },
    [files, onFilesChange, acceptedTypes, maxFiles],
  );

  /** Simple file add (from the flat file picker or plain drop). */
  const addSimpleFiles = useCallback(
    (fileList: FileList | File[], targetFolder?: string) => {
      const folder =
        targetFolder !== undefined
          ? targetFolder
          : showFolders
            ? (activeFolder ?? undefined)
            : undefined;
      addFileEntries(
        Array.from(fileList).map((file) => ({ file, folderPath: folder })),
      );
    },
    [addFileEntries, showFolders, activeFolder],
  );

  // ── Drop handling ─────────────────────────────────────────────────────────

  /**
   * Called synchronously in the drop event to collect FileSystemEntry objects
   * (the DataTransfer is wiped after the event returns), then processed async.
   */
  const handleDrop = useCallback(
    (e: React.DragEvent, targetFolder?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setDragOverFolder(null);

      if (!showFolders) {
        addSimpleFiles(e.dataTransfer.files, targetFolder);
        return;
      }

      // Collect EVERYTHING synchronously before the event is recycled.
      const entries = collectEntries(e.dataTransfer);
      // Capture flat file list as a fallback in case async traversal fails.
      const fallbackFiles = Array.from(e.dataTransfer.files);
      const hasDir = entries.some((en) => en.isDirectory);

      if (!hasDir) {
        addSimpleFiles(e.dataTransfer.files, targetFolder);
        return;
      }

      // Async traversal — basePath is the folder we're dropping INTO
      setIsTraversing(true);
      console.debug("[FileUpload] Starting traversal, entries:", entries.length);
      resolveEntries(entries, targetFolder)
        .then(({ items, folderPaths }) => {
          console.debug(
            "[FileUpload] Traversal done — files:",
            items.length,
            "folders:",
            folderPaths.size,
          );
          mergeFolders(folderPaths);
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            folderPaths.forEach((p) => next.add(p));
            return next;
          });
          if (items.length === 0 && fallbackFiles.length > 0) {
            // Traversal produced no files — browser may not support FileSystem API
            // file reading from dropped directories. Fall back to the flat list.
            console.warn("[FileUpload] Traversal returned 0 files, using fallback");
            addSimpleFiles(
              fallbackFiles as unknown as FileList,
              targetFolder,
            );
          } else {
            addFileEntries(items);
          }
        })
        .catch((err) => {
          console.error("[FileUpload] Traversal error:", err);
          // Fall back to whatever the browser gives us in dataTransfer.files
          addSimpleFiles(fallbackFiles as unknown as FileList, targetFolder);
        })
        .finally(() => setIsTraversing(false));
    },
    [showFolders, addSimpleFiles, mergeFolders, addFileEntries],
  );

  /** Handle <input webkitdirectory> change. */
  const handleFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      const { items, folderPaths } = parseWebkitDirectory(e.target.files);
      mergeFolders(folderPaths);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        folderPaths.forEach((p) => next.add(p));
        return next;
      });
      addFileEntries(items);
      e.target.value = "";
    },
    [mergeFolders, addFileEntries],
  );

  // ── File mutations ────────────────────────────────────────────────────────

  const removeFile = useCallback(
    (index: number) => onFilesChange(files.filter((_, i) => i !== index)),
    [files, onFilesChange],
  );

  const updateDocType = useCallback(
    (index: number, docType: DocumentType) =>
      onFilesChange(
        files.map((f, i) => (i === index ? { ...f, docType } : f)),
      ),
    [files, onFilesChange],
  );

  // ── Folder mutations ──────────────────────────────────────────────────────

  function confirmCreateFolder(name: string) {
    const trimmed = name.trim();
    setCreatingFolder(false);
    setNewFolderName("");
    if (!trimmed) return;
    const path = activeFolder ? `${activeFolder}/${trimmed}` : trimmed;
    if (folders.some((f) => f.path === path)) {
      toast.error("תיקייה בשם זה כבר קיימת");
      return;
    }
    onFoldersChange?.([...folders, { path }]);
    setActiveFolder(path);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (activeFolder) next.add(activeFolder);
      return next;
    });
  }

  function startRename(path: string) {
    const segs = path.split("/");
    setRenamingPath(path);
    setRenameValue(segs[segs.length - 1]);
    setTimeout(() => renameInputRef.current?.focus(), 30);
  }

  function confirmRename() {
    if (!renamingPath) return;
    const trimmed = renameValue.trim();
    setRenamingPath(null);
    setRenameValue("");
    if (!trimmed) return;
    const segs = renamingPath.split("/");
    const newPath = [...segs.slice(0, -1), trimmed].join("/");
    if (newPath === renamingPath) return;
    if (folders.some((f) => f.path === newPath)) {
      toast.error("תיקייה בשם זה כבר קיימת");
      return;
    }
    onFoldersChange?.(renameFolderPaths(folders, renamingPath, newPath));
    onFilesChange(renameFileFolders(files, renamingPath, newPath));
    if (activeFolder === renamingPath) setActiveFolder(newPath);
    else if (activeFolder?.startsWith(renamingPath + "/"))
      setActiveFolder(newPath + activeFolder.slice(renamingPath.length));
  }

  function deleteFolder(path: string) {
    const parent = parentPath(path);
    // Move files to parent
    onFilesChange(
      files.map((f) => {
        if (f.folder === path || f.folder?.startsWith(path + "/"))
          return { ...f, folder: parent };
        return f;
      }),
    );
    // Remove this folder and all descendants
    onFoldersChange?.(
      folders.filter(
        (f) => f.path !== path && !f.path.startsWith(path + "/"),
      ),
    );
    if (activeFolder === path || activeFolder?.startsWith(path + "/"))
      setActiveFolder(parent ?? null);
  }

  function toggleExpand(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // ── Simple layout (no folders) ─────────────────────────────────────────

  if (!showFolders) {
    return (
      <div className="space-y-6">
        {showOverallProgress && isUploading && (
          <OverallProgressBar
            completed={completedCount}
            total={files.length}
            progress={totalProgress}
            errors={files.filter((f) => f.status === "error").length}
          />
        )}
        {!isUploading && (
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors",
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => handleDrop(e)}
          >
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">
              גרור ושחרר קבצי {acceptLabel} כאן
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              או לחץ לבחירת קבצים (עד {maxFiles} קבצים)
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="ml-2 h-4 w-4" />
              בחר קבצים
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr}
              multiple
              className="hidden"
              onChange={(e) =>
                e.target.files && addSimpleFiles(e.target.files)
              }
            />
          </div>
        )}
        {files.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-medium">
                מסמכים ({completedCount}/{files.length} הועלו)
              </h3>
              {files.map((entry, i) => (
                <FileRow
                  key={`${entry.file.name}-${i}`}
                  entry={entry}
                  index={i}
                  isUploading={isUploading}
                  showDocTypeSelector={showDocTypeSelector}
                  onRemove={() => removeFile(i)}
                  onDocTypeChange={(dt) => updateDocType(i, dt)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Folder layout ─────────────────────────────────────────────────────────

  return (
    <div className="flex rounded-xl border overflow-hidden min-h-[480px]">
      {/* ── Sidebar ── */}
      <div className="w-60 shrink-0 border-l bg-muted/30 flex flex-col">
        <div className="px-3 py-2.5 border-b flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            תיקיות
          </span>
          {!isUploading && (
            <div className="flex gap-1">
              <button
                type="button"
                title="העלה תיקייה"
                onClick={() => folderInputRef.current?.click()}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="תיקייה חדשה"
                onClick={() => {
                  setCreatingFolder(true);
                  setNewFolderName("");
                  setTimeout(() => newFolderInputRef.current?.focus(), 30);
                }}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
          {/* All files */}
          <SidebarItem
            label="כל הקבצים"
            count={files.length}
            active={activeFolder === null}
            onClick={() => setActiveFolder(null)}
            icon={<Folder className="h-4 w-4 shrink-0" />}
          />

          {/* Tree */}
          {tree.map((node) => (
            <FolderTreeNode
              key={node.path}
              node={node}
              depth={0}
              activeFolder={activeFolder}
              dragOverFolder={dragOverFolder}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              isUploading={isUploading}
              onSelect={setActiveFolder}
              onToggleExpand={toggleExpand}
              onStartRename={startRename}
              onRenameChange={setRenameValue}
              onConfirmRename={confirmRename}
              onCancelRename={() => {
                setRenamingPath(null);
                setRenameValue("");
              }}
              onDelete={deleteFolder}
              onDragOver={(e, path) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverFolder(path);
              }}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(e, path) => handleDrop(e, path)}
            />
          ))}

          {/* New folder inline input */}
          {creatingFolder && (
            <div className="px-1 pt-0.5">
              <input
                ref={newFolderInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreateFolder(newFolderName);
                  if (e.key === "Escape") {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }
                }}
                onBlur={() =>
                  setTimeout(() => confirmCreateFolder(newFolderName), 120)
                }
                placeholder="שם התיקייה"
                className="w-full text-sm rounded-lg px-2 py-1.5 border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
                dir="rtl"
              />
            </div>
          )}
        </nav>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background">
          <div className="flex items-center gap-2 min-w-0">
            {activeFolder !== null ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm font-medium truncate">
              {activeFolder === null
                ? "כל הקבצים"
                : (activeFolder.split("/").pop() ?? activeFolder)}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              ({activeFiles.length})
            </span>
          </div>
          {!isUploading && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-3 w-3" />
              הוסף קבצים
            </Button>
          )}
        </div>

        {/* Drop zone + file list */}
        <div
          className={cn(
            "flex-1 p-4 overflow-y-auto transition-colors",
            isDragOver && !dragOverFolder
              ? "bg-primary/5 ring-2 ring-inset ring-primary/20"
              : "",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => handleDrop(e, activeFolder ?? undefined)}
        >
          {isTraversing ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm">קורא תיקיות…</p>
            </div>
          ) : activeFiles.length === 0 ? (
            <EmptyDropArea
              label={
                activeFolder
                  ? `גרור קבצים או תיקיות ל-"${activeFolder.split("/").pop()}"`
                  : `גרור קבצים או תיקיות לכאן`
              }
              subLabel={`עד ${maxFiles} קבצים`}
              onBrowse={() => fileInputRef.current?.click()}
            />
          ) : activeFolder === null ? (
            // All files — grouped by folder
            <AllFilesGrouped
              files={files}
              tree={tree}
              expandedFolders={expandedFolders}
              onToggleExpand={toggleExpand}
              renderRow={(entry, absIdx) => (
                <FileRow
                  key={`${entry.file.name}-${absIdx}`}
                  entry={entry}
                  index={absIdx}
                  isUploading={isUploading}
                  showDocTypeSelector={showDocTypeSelector}
                  onRemove={() => removeFile(absIdx)}
                  onDocTypeChange={(dt) => updateDocType(absIdx, dt)}
                />
              )}
            />
          ) : (
            <div className="space-y-2">
              {activeFiles.map((entry) => {
                const absIdx = files.indexOf(entry);
                return (
                  <FileRow
                    key={`${entry.file.name}-${absIdx}`}
                    entry={entry}
                    index={absIdx}
                    isUploading={isUploading}
                    showDocTypeSelector={showDocTypeSelector}
                    onRemove={() => removeFile(absIdx)}
                    onDocTypeChange={(dt) => updateDocType(absIdx, dt)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Overall progress */}
        {showOverallProgress && isUploading && (
          <div className="px-4 pb-3 pt-2 border-t">
            <OverallProgressBar
              completed={completedCount}
              total={files.length}
              progress={totalProgress}
              errors={files.filter((f) => f.status === "error").length}
            />
          </div>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        multiple
        className="hidden"
        onChange={(e) =>
          e.target.files && addSimpleFiles(e.target.files)
        }
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderInput}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SidebarItem({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-right",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-muted text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 text-right truncate">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {count}
      </span>
    </button>
  );
}

function FolderTreeNode({
  node,
  depth,
  activeFolder,
  dragOverFolder,
  expandedFolders,
  renamingPath,
  renameValue,
  renameInputRef,
  isUploading,
  onSelect,
  onToggleExpand,
  onStartRename,
  onRenameChange,
  onConfirmRename,
  onCancelRename,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  node: TreeNode;
  depth: number;
  activeFolder: string | null;
  dragOverFolder: string | null;
  expandedFolders: Set<string>;
  renamingPath: string | null;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  onSelect: (path: string) => void;
  onToggleExpand: (path: string) => void;
  onStartRename: (path: string) => void;
  onRenameChange: (v: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onDelete: (path: string) => void;
  onDragOver: (e: React.DragEvent, path: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, path: string) => void;
}) {
  const isActive = activeFolder === node.path;
  const isDragTarget = dragOverFolder === node.path;
  const isExpanded = expandedFolders.has(node.path);
  const isRenaming = renamingPath === node.path;
  const hasChildren = node.children.length > 0;
  const indent = depth * 12;

  return (
    <div>
      <div
        className="group relative"
        onDragOver={(e) => onDragOver(e, node.path)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, node.path)}
      >
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors",
            isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
            isDragTarget && !isActive
              ? "ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-950/30"
              : "",
          )}
          style={{ paddingRight: `${8 + indent}px` }}
        >
          {/* Expand toggle */}
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => hasChildren && onToggleExpand(node.path)}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="w-3.5 h-3.5 block" />
            )}
          </button>

          {/* Folder icon + name */}
          <button
            type="button"
            className="flex items-center gap-1.5 flex-1 min-w-0 text-right text-sm"
            onClick={() => onSelect(node.path)}
          >
            {isActive ? (
              <FolderOpen className="h-4 w-4 shrink-0" />
            ) : (
              <Folder className="h-4 w-4 shrink-0" />
            )}

            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onConfirmRename();
                  if (e.key === "Escape") onCancelRename();
                }}
                onBlur={() => setTimeout(onConfirmRename, 100)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 text-sm bg-background border rounded px-1 py-0 focus:outline-none focus:ring-1 focus:ring-primary text-right"
                dir="rtl"
              />
            ) : (
              <span className="truncate flex-1">{node.name}</span>
            )}
          </button>

          <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-1">
            {node.totalCount}
          </span>

          {/* Actions (rename / delete) */}
          {!isUploading && !isRenaming && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename(node.path);
                }}
                className="p-0.5 rounded hover:bg-muted-foreground/20"
                title="שנה שם"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.path);
                }}
                className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive"
                title="מחק תיקייה"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children
            .sort((a, b) => a.name.localeCompare(b.name, "he"))
            .map((child) => (
              <FolderTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFolder={activeFolder}
                dragOverFolder={dragOverFolder}
                expandedFolders={expandedFolders}
                renamingPath={renamingPath}
                renameValue={renameValue}
                renameInputRef={renameInputRef}
                isUploading={isUploading}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onStartRename={onStartRename}
                onRenameChange={onRenameChange}
                onConfirmRename={onConfirmRename}
                onCancelRename={onCancelRename}
                onDelete={onDelete}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function AllFilesGrouped({
  files,
  tree,
  expandedFolders,
  onToggleExpand,
  renderRow,
}: {
  files: FileEntry[];
  tree: TreeNode[];
  expandedFolders: Set<string>;
  onToggleExpand: (path: string) => void;
  renderRow: (entry: FileEntry, absIdx: number) => React.ReactNode;
}) {
  function GroupSection({
    label,
    groupFiles,
    path,
  }: {
    label: string;
    groupFiles: FileEntry[];
    path: string;
  }) {
    const collapsed = !expandedFolders.has(path);
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleExpand(path)}
          className="flex w-full items-center gap-2 py-1 text-sm font-medium hover:text-primary transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
          <span className="text-xs text-muted-foreground font-normal">
            ({groupFiles.length})
          </span>
        </button>
        {!collapsed && (
          <div className="space-y-1.5 pr-6 mt-1">
            {groupFiles.map((entry) => renderRow(entry, files.indexOf(entry)))}
          </div>
        )}
      </div>
    );
  }

  function renderTree(nodes: TreeNode[], parentExpanded: boolean): React.ReactNode {
    if (!parentExpanded) return null;
    return nodes.map((node) => {
      const groupFiles = files.filter((f) => f.folder === node.path);
      return (
        <div key={node.path}>
          {groupFiles.length > 0 && (
            <GroupSection
              label={node.name}
              groupFiles={groupFiles}
              path={node.path}
            />
          )}
          {node.children.length > 0 && (
            <div className="pr-4">
              {renderTree(node.children, expandedFolders.has(node.path))}
            </div>
          )}
        </div>
      );
    });
  }

  const uncategorized = files.filter((f) => !f.folder);

  return (
    <div className="space-y-3">
      {uncategorized.length > 0 && (
        <GroupSection
          label="ללא תיקייה"
          groupFiles={uncategorized}
          path="__uncategorized__"
        />
      )}
      {renderTree(tree, true)}
    </div>
  );
}

function FileRow({
  entry,
  index,
  isUploading,
  showDocTypeSelector,
  onRemove,
  onDocTypeChange,
}: {
  entry: FileEntry;
  index: number;
  isUploading: boolean;
  showDocTypeSelector: boolean;
  onRemove: () => void;
  onDocTypeChange: (dt: DocumentType) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-3">
        <StatusIcon status={entry.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {fmtSize(entry.file.size)}
            {entry.error && (
              <span className="mr-2 text-destructive">— {entry.error}</span>
            )}
          </p>
        </div>
        {showDocTypeSelector && (
          <Select
            value={entry.docType}
            onValueChange={(v) => onDocTypeChange(v as DocumentType)}
            disabled={isUploading}
            dir="rtl"
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((dt) => (
                <SelectItem key={dt} value={dt}>
                  {DOC_TYPE_LABELS[dt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onRemove}
          disabled={isUploading}
        >
          <Trash2 className="h-4 w-4 text-destructive/70 hover:text-destructive" />
        </Button>
      </div>
      {(entry.status === "uploading" ||
        entry.status === "complete" ||
        entry.status === "error") && (
        <Progress
          value={entry.progress}
          className={`h-1.5 ${progressClass(entry.status)}`}
        />
      )}
    </div>
  );
}

function EmptyDropArea({
  label,
  subLabel,
  onBrowse,
}: {
  label: string;
  subLabel: string;
  onBrowse: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[320px] gap-3 text-muted-foreground">
      <Upload className="h-10 w-10 opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs mt-0.5 opacity-60">{subLabel}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onBrowse}>
        <FileUp className="ml-1.5 h-3.5 w-3.5" />
        בחר קבצים
      </Button>
    </div>
  );
}

function OverallProgressBar({
  completed,
  total,
  progress,
  errors,
}: {
  completed: number;
  total: number;
  progress: number;
  errors: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {completed === total
            ? "כל הקבצים הועלו בהצלחה"
            : errors > 0
              ? "חלק מהקבצים נכשלו"
              : "מעלה קבצים..."}
        </span>
        <span className="text-muted-foreground">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {completed} / {total} קבצים הושלמו
        </span>
        {errors > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            {errors} נכשלו
          </span>
        )}
      </div>
    </div>
  );
}

// ── Upload hook ────────────────────────────────────────────────────────────

export interface UseFileUploadOptions {
  concurrency?: number;
}

export interface UseFileUploadReturn {
  uploadAll: (
    files: FileEntry[],
    projectId: string,
    onFileUpdate: (index: number, patch: Partial<FileEntry>) => void,
  ) => Promise<{ completed: number; failed: number }>;
  abort: () => void;
  isUploading: boolean;
}

export function useFileUpload(
  opts: UseFileUploadOptions = {},
): UseFileUploadReturn {
  const { concurrency = 3 } = opts;
  const abortRef = useRef<AbortController | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadAll = useCallback(
    async (
      files: FileEntry[],
      projectId: string,
      onFileUpdate: (index: number, patch: Partial<FileEntry>) => void,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsUploading(true);

      let completed = 0;
      let failed = 0;

      async function uploadOne(entry: FileEntry, index: number) {
        onFileUpdate(index, { status: "uploading", progress: 0 });
        try {
          const response = await api.initiateUpload({
            project_id: projectId,
            filename: entry.file.name,
            content_type: resolveMime(entry.file),
            doc_type: entry.docType,
            file_size: entry.file.size,
            folder: entry.folder,
          });
          const { upload_url, file_id, gcs_uri, already_exists } = response;
          onFileUpdate(index, { fileId: file_id, gcsUri: gcs_uri });

          if (already_exists) {
            // Identical file already in project — skip GCS upload entirely.
            onFileUpdate(index, { status: "complete", progress: 100 });
            completed++;
            return;
          }

          if (!upload_url) {
            throw new Error("No upload URL returned from server");
          }

          await uploadFile(
            upload_url,
            entry.file,
            {
              onProgress: (p: UploadProgress) =>
                onFileUpdate(index, { progress: p.percent }),
            },
            controller.signal,
          );
          await api.completeUpload({ file_id, file_size_bytes: entry.file.size });
          onFileUpdate(index, { status: "complete", progress: 100 });
          completed++;
        } catch (err) {
          if (controller.signal.aborted) return;
          onFileUpdate(index, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
          failed++;
        }
      }

      const queue = files.map((entry, index) => ({ entry, index }));
      for (let i = 0; i < queue.length; i += concurrency) {
        if (controller.signal.aborted) break;
        await Promise.allSettled(
          queue
            .slice(i, i + concurrency)
            .map(({ entry, index }) => uploadOne(entry, index)),
        );
      }

      setIsUploading(false);
      return { completed, failed };
    },
    [concurrency],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsUploading(false);
  }, []);

  return { uploadAll, abort, isUploading };
}
