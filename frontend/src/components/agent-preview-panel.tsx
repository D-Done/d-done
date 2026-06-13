"use client";

import { Bot, CheckCircle2, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentPreview, KnowledgeBaseFile } from "@/lib/types";

interface AgentPreviewPanelProps {
  preview: AgentPreview | null;
  knowledgeBaseFiles: KnowledgeBaseFile[];
  isReady: boolean;
  onPublish: () => void;
  isPublishing: boolean;
}

export function AgentPreviewPanel({
  preview,
  knowledgeBaseFiles,
  isReady,
  onPublish,
  isPublishing,
}: AgentPreviewPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">תצוגה מקדימה</h2>
      </div>

      {/* Agent card */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">הסוכן שלך</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              שם
            </p>
            {preview?.name ? (
              <p className="text-sm font-semibold">{preview.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                יוגדר אוטומטית מהשיחה...
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              תיאור
            </p>
            {preview?.description ? (
              <p className="text-sm leading-relaxed">{preview.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                יפוק מהשיחה אחרי שתספר לנו על המטרה...
              </p>
            )}
          </div>

          {/* Extraction schema indicator */}
          {preview?.has_extraction_schema && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>שדות חילוץ הוגדרו</span>
            </div>
          )}

          {/* Reference documents */}
          {knowledgeBaseFiles.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                מסמכי עזר מצורפים
              </p>
              <ul className="flex flex-col gap-1">
                {knowledgeBaseFiles.map((f) => (
                  <li key={f.file_id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.original_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {!preview?.name && !preview?.description && knowledgeBaseFiles.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              <Bot className="h-10 w-10 opacity-20" />
              <p className="text-sm">
                ספר לנו מה הסוכן צריך לעשות — הפרטים יופיעו כאן אוטומטית
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status & publish CTA */}
      <div className="flex flex-col gap-2">
        {isReady ? (
          <Badge variant="outline" className="w-fit border-green-500 text-green-600">
            מוכן ליצירה
          </Badge>
        ) : (
          <Badge variant="outline" className="w-fit text-muted-foreground">
            בהגדרה...
          </Badge>
        )}

        <button
          onClick={onPublish}
          disabled={!isReady || isPublishing}
          className={[
            "w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
            isReady && !isPublishing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "cursor-not-allowed bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {isPublishing ? "יוצר סוכן..." : "צור סוכן"}
        </button>

        {!isReady && (
          <p className="text-center text-xs text-muted-foreground">
            המשך את השיחה עד שהסוכן יהיה מוגדר
          </p>
        )}
      </div>
    </div>
  );
}
