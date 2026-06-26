import type {
  AiPromptsResponse,
  AnalyzeResponse,
  CustomAgent,
  DashboardStats,
  DDReportResponse,
  DealType,
  Project,
  ProjectListItem,
  ProjectMember,
  RealEstateType,
  UploadInitiateRequest,
  UploadInitiateResponse,
  UploadCompleteRequest,
  UploadCompleteResponse,
} from "./types";

export type { Project };

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ============================================================
// Helpers
// ============================================================

function detailMessage(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) {
      return String((d[0] as { msg: string }).msg);
    }
  }
  return "Something went wrong";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    if (!path.startsWith("/auth/me") && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, detailMessage(body));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, detailMessage(body));
  }

  // Handle 204 No Content (e.g. DELETE)
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ============================================================
// Auth (backend JWT)
// ============================================================

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  provider: string | null;
  approval_status: string;
  is_admin: boolean;
  team: string | null;
  has_completed_onboarding: boolean;
  is_deleted?: boolean;
}

export async function getMe(): Promise<MeResponse | null> {
  try {
    return await request<MeResponse>("/auth/me", { method: "GET" });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    return null;
  }
}

/** Exchange Descope session JWT for backend HttpOnly session cookie. */
export async function createBackendSession(body: {
  descopeToken: string;
  inviteToken?: string;
  providerHint?: string;
}): Promise<MeResponse> {
  return request<MeResponse>("/auth/session", {
    method: "POST",
    body: JSON.stringify({
      descopeToken: body.descopeToken,
      ...(body.inviteToken ? { inviteToken: body.inviteToken } : {}),
      ...(body.providerHint ? { providerHint: body.providerHint } : {}),
    }),
  });
}

export async function logoutSession(): Promise<void> {
  await request<void>("/auth/session", { method: "DELETE" });
}

export type InvitePreviewResponse =
  | {
      valid: true;
      orgName: string | null;
      emailHint: string | null;
      inviteeEmail: string | null;
      role: string | null;
    }
  | { valid: false; reason: string };

export async function previewInvite(
  token: string,
): Promise<InvitePreviewResponse> {
  return request<InvitePreviewResponse>("/invites/preview", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function updateProfile(data: {
  name?: string;
  team?: string;
}): Promise<MeResponse> {
  return request<MeResponse>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function completeOnboarding(): Promise<MeResponse> {
  return request<MeResponse>("/auth/me/complete-onboarding", {
    method: "POST",
  });
}

// ============================================================
// Admin — user management
// ============================================================

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  provider: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  approval_status: string;
  is_admin: boolean;
  is_deleted?: boolean;
  created_at: string;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
}

export async function adminListUsers(
  status?: string,
): Promise<AdminUserListResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<AdminUserListResponse>(`/admin/users${qs}`);
}

export async function adminSetApproval(
  userId: string,
  approval_status: string,
): Promise<AdminUser> {
  return request<AdminUser>(`/admin/users/${userId}/approval`, {
    method: "PATCH",
    body: JSON.stringify({ approval_status }),
  });
}

export async function adminSetAdmin(
  userId: string,
  is_admin: boolean,
): Promise<AdminUser> {
  return request<AdminUser>(`/admin/users/${userId}/admin`, {
    method: "PATCH",
    body: JSON.stringify({ is_admin }),
  });
}

export interface InvitationRow {
  id: string;
  email: string;
  invited_by_email: string | null;
  status: string;
  created_at: string;
  expires_at?: string | null;
  revoked?: boolean;
}

export async function adminCreateInvitation(email: string): Promise<{
  invitation: InvitationRow;
  invite_url: string;
  email_sent: boolean;
}> {
  return request<{
    invitation: InvitationRow;
    invite_url: string;
    email_sent: boolean;
  }>("/admin/invitations", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

export async function adminListInvitations(): Promise<InvitationRow[]> {
  return request<InvitationRow[]>("/admin/invitations", { method: "GET" });
}

export async function adminRevokeInvitation(
  invitationId: string,
): Promise<void> {
  await request<void>(`/admin/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await request<void>(`/admin/users/${userId}`, { method: "DELETE" });
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email_snapshot: string;
  actor_name_snapshot: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditListResponse {
  items: AuditLogRow[];
  total: number;
}

export async function adminListAudit(opts?: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditListResponse> {
  const params = new URLSearchParams();
  if (opts?.entityType) params.set("entity_type", opts.entityType);
  if (opts?.entityId) params.set("entity_id", opts.entityId);
  if (opts?.actorId) params.set("actor_id", opts.actorId);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return request<AuditListResponse>(
    `/admin/audit${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

export interface UserActivityRow {
  user_id: string;
  email: string;
  name: string | null;
  project_count: number;
  dd_check_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  last_active: string | null;
}

export interface ActivityResponse {
  users: UserActivityRow[];
  totals: Record<string, number>;
}

export async function adminGetActivity(): Promise<ActivityResponse> {
  return request<ActivityResponse>("/admin/activity");
}

// ============================================================
// Projects
// ============================================================

/**
 * Payload for the "Brain" project-creation flow. The backend accepts either
 * this structured shape (persisting transaction_type + transaction_metadata
 * explicitly) or the legacy {title, description} form. Always prefer the
 * structured form from the new-transaction page so the M&A pipeline receives
 * real metadata instead of a scraped description string.
 */
export interface ProjectCreateStructured {
  transaction_type: "real_estate_financing" | "ma" | "company_investment";
  project_name: string;
  client_name?: string | null;
  role?: string | null;
  role_other?: string | null;
  counterparty_name?: string | null;
  description?: string | null;
}

export async function createProject(
  data: { title: string; description?: string } | ProjectCreateStructured,
): Promise<Project> {
  return request<Project>("/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listProjects(opts?: {
  q?: string;
}): Promise<ProjectListItem[]> {
  const q = opts?.q?.trim();
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return request<ProjectListItem[]>(`/projects/${qs}`);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return request<DashboardStats>("/projects/stats");
}

export async function getProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${id}`);
}

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  return request<ProjectMember[]>(`/projects/${projectId}/members`);
}

/** Users in the current user's organization (for adding project members). */
export interface OrganizationUser {
  id: string;
  email: string;
  name: string | null;
}

export async function getOrganizationUsers(
  q?: string,
): Promise<OrganizationUser[]> {
  const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return request<OrganizationUser[]>(`/organization/users${params}`);
}

export async function getUserProfile(userId: string) {
  return request<import("@/lib/types").UserProfileData>(
    `/organization/users/${userId}/profile`
  );
}

export async function getLeaderboard() {
  return request<import("@/lib/types").LeaderboardResponse>(
    `/organization/leaderboard`
  );
}

export async function addProjectMember(
  projectId: string,
  email: string,
): Promise<ProjectMember> {
  return request<ProjectMember>(`/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function removeProjectMember(
  projectId: string,
  memberUserId: string,
): Promise<void> {
  return request<void>(`/projects/${projectId}/members/${memberUserId}`, {
    method: "DELETE",
  });
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/projects/${id}`, {
    method: "DELETE",
  });
}

// ============================================================
// Documents — GCS resumable upload flow
// ============================================================

/**
 * Step 1: Ask the backend to create a GCS resumable session and a
 * file record in the DB (status = "pending").
 */
export async function initiateUpload(
  data: UploadInitiateRequest,
): Promise<UploadInitiateResponse> {
  return request<UploadInitiateResponse>("/upload/initiate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Step 3: Notify the backend that GCS returned 200/201 — the upload is
 * confirmed.  The backend updates the file record to "uploaded".
 */
export async function completeUpload(
  data: UploadCompleteRequest,
): Promise<UploadCompleteResponse> {
  return request<UploadCompleteResponse>("/upload/complete", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============================================================
// Analysis
// ============================================================

/**
 * Trigger a DD analysis for a project.
 * For MVP this runs synchronously and returns the full report.
 */
export async function analyzeProject(
  projectId: string,
): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>(`/projects/${projectId}/analyze`, {
    method: "POST",
  });
}

export async function analyzeProjectWithOptions(
  projectId: string,
  options?: {
    deal_type?: DealType;
    real_estate_type?: RealEstateType;
    custom_prompt?: string;
    use_visual_grounding?: boolean;
    optional_chapters?: string[];
  },
): Promise<AnalyzeResponse> {
  const hasBody =
    !!options?.deal_type ||
    !!options?.real_estate_type ||
    !!options?.use_visual_grounding ||
    !!options?.optional_chapters;
  return request<AnalyzeResponse>(`/projects/${projectId}/analyze`, {
    method: "POST",
    ...(hasBody || options?.custom_prompt
      ? { body: JSON.stringify(options) }
      : {}),
  });
}

// ============================================================
// Settings
// ============================================================

export async function getAiPrompts(): Promise<AiPromptsResponse> {
  return request<AiPromptsResponse>("/settings/ai-prompts", { method: "GET" });
}

export async function putAiPrompts(
  prompts: AiPromptsResponse["prompts"],
): Promise<AiPromptsResponse> {
  return request<AiPromptsResponse>("/settings/ai-prompts", {
    method: "PUT",
    body: JSON.stringify({ prompts }),
  });
}

export async function getRealEstateFinanceDefaultPrompt(): Promise<{
  prompt: string;
}> {
  return request<{ prompt: string }>(
    "/settings/real-estate-finance/default-prompt",
    {
      method: "GET",
    },
  );
}

export async function getAgentPrompts(
  transactionType: string,
): Promise<import("./types").AgentPromptsListResponse> {
  return request<import("./types").AgentPromptsListResponse>(
    `/settings/agent-prompts/${transactionType}`,
    { method: "GET" },
  );
}

export async function updateAgentPrompt(
  transactionType: string,
  fileKey: string,
  content: string,
): Promise<{ file_key: string; content: string }> {
  return request<{ file_key: string; content: string }>(
    `/settings/agent-prompts/${transactionType}/${fileKey}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  );
}

export async function getAgentSchema(
  fileKey: string,
): Promise<import("./types").AgentSchemaResponse> {
  return request<import("./types").AgentSchemaResponse>(
    `/settings/agent-schema/${fileKey}`,
    {
      method: "GET",
    },
  );
}

export async function updateAgentSchema(
  fileKey: string,
  body: Record<string, unknown>,
): Promise<{ file_key: string; overrides: Record<string, unknown> }> {
  return request<{ file_key: string; overrides: Record<string, unknown> }>(
    `/settings/agent-schema/${fileKey}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export async function getAgentPydantic(
  fileKey: string,
): Promise<import("./types").AgentPydanticResponse> {
  return request<import("./types").AgentPydanticResponse>(
    `/settings/agent-pydantic/${fileKey}`,
    {
      method: "GET",
    },
  );
}

// ============================================================
// Results
// ============================================================

export async function getResults(projectId: string): Promise<DDReportResponse> {
  return request<DDReportResponse>(`/projects/${projectId}/results`);
}

/** HITL review payload: tenant records + signing sources for the review UI. */
export interface HitlTenantData {
  tenant_records: Array<{
    sub_parcel: string;
    owner_name: string;
    is_signed: boolean;
    date_signed?: string | null;
    source?: {
      source_document_name: string;
      page_number: number;
      verbatim_quote: string;
      box_2d?: number[] | null;
    } | null;
  }>;
  signing_percentage: number;
  signing_sources: Array<{
    source_document_name: string;
    page_number: number;
    verbatim_quote: string;
    box_2d?: number[] | null;
  }>;
  block?: string | null;
  parcel?: string | null;
}

export async function getHitlReviewData(
  projectId: string,
  checkId: string,
): Promise<HitlTenantData> {
  return request<HitlTenantData>(
    `/projects/${projectId}/results/${checkId}/hitl-review-data`,
    { method: "GET" },
  );
}

export async function approveTenantTable(
  projectId: string,
  checkId: string,
  tenantRecords: HitlTenantData["tenant_records"],
  correctionPrompt?: string,
): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>(
    `/projects/${projectId}/results/${checkId}/approve-tenant-table`,
    {
      method: "POST",
      body: JSON.stringify({
        tenant_records: tenantRecords,
        correction_prompt: correctionPrompt || null,
      }),
    },
  );
}

/** Response from GET citation endpoint: signed URL + precomputed polygons (serve on click). */
export interface CitationViewResponse {
  view_url: string;
  expires_in_seconds: number;
  page_number: number;
  bounding_boxes: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  document_name: string;
}

export async function getCitationView(
  projectId: string,
  checkId: string,
  findingIndex: number,
  sourceIndex: number,
  citationSection?: "tenant_signing" | "tenant_warning_note",
): Promise<CitationViewResponse> {
  const params = new URLSearchParams({
    finding_index: String(citationSection ? -1 : findingIndex),
    source_index: String(sourceIndex),
  });
  if (citationSection) params.set("citation_section", citationSection);
  return request<CitationViewResponse>(
    `/projects/${projectId}/results/${checkId}/citation?${params.toString()}`,
    { method: "GET" },
  );
}

// ============================================================
// Files (view URLs)
// ============================================================

export async function getFileViewUrl(
  projectId: string,
  fileId: string,
): Promise<{ url: string; expires_in_seconds: number }> {
  return request<{ url: string; expires_in_seconds: number }>(
    `/projects/${projectId}/files/${fileId}/view-url`,
    { method: "GET" },
  );
}

export async function getFileDownloadUrl(
  projectId: string,
  fileId: string,
): Promise<{ url: string; expires_in_seconds: number }> {
  return request<{ url: string; expires_in_seconds: number }>(
    `/projects/${projectId}/files/${fileId}/download-url`,
    { method: "GET" },
  );
}

export async function deleteProjectFile(
  projectId: string,
  fileId: string,
): Promise<void> {
  await request<void>(`/projects/${projectId}/files/${fileId}`, {
    method: "DELETE",
  });
}

export async function getFileBlobUrl(
  projectId: string,
  fileId: string,
  download = false,
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/files/${fileId}/content${download ? "?download=true" : ""}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function downloadAllFiles(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/files/download-all`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `documents.zip`;
  return { blob, filename };
}

// ============================================================
// VDR (external-party upload)
// ============================================================

export interface VdrCreateRequest {
  invited_email: string;
  transaction_type: string;
  project_name: string;
  client_name?: string | null;
  role?: string | null;
  counterparty_name?: string | null;
  description?: string | null;
}

export interface VdrCreateResponse {
  vdr_request_id: string;
  project_id: string;
  invited_email: string;
  status: string;
  expires_at: string;
  email_sent: boolean;
  upload_url: string;
}

export interface VdrPublicInfo {
  project_name: string;
  status: string;
}

export interface VdrUploadInitiateResponse {
  upload_url: string | null;
  file_id: string;
  gcs_uri: string;
  max_size_bytes: number;
  already_exists: boolean;
}

export interface VdrUploadCompleteResponse {
  file_id: string;
  upload_status: string;
}

// Strip the /api/v1 suffix from API_BASE to get the server root for public VDR endpoints
const VDR_SERVER_ROOT = API_BASE.replace(/\/api\/v1\/?$/, "");

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${VDR_SERVER_ROOT}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, detailMessage(body));
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function createVdrRequest(data: VdrCreateRequest): Promise<VdrCreateResponse> {
  return request<VdrCreateResponse>("/vdr/requests", {
    method: "POST",
    body: JSON.stringify(data),
    credentials: "include",
  });
}

export async function getVdrPublicInfo(token: string): Promise<VdrPublicInfo> {
  return publicRequest<VdrPublicInfo>(`/api/v1/vdr/public/${token}`);
}

export async function vdrInitiateUpload(
  token: string,
  body: { filename: string; content_type: string; file_size?: number; folder?: string },
): Promise<VdrUploadInitiateResponse> {
  return publicRequest<VdrUploadInitiateResponse>(
    `/api/v1/vdr/public/${token}/upload/initiate`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function vdrCompleteUpload(
  token: string,
  fileId: string,
  fileSizeBytes: number,
): Promise<VdrUploadCompleteResponse> {
  return publicRequest<VdrUploadCompleteResponse>(
    `/api/v1/vdr/public/${token}/upload/complete`,
    { method: "POST", body: JSON.stringify({ file_id: fileId, file_size_bytes: fileSizeBytes }) },
  );
}

export async function vdrSubmit(token: string): Promise<{ status: string; message: string }> {
  return publicRequest<{ status: string; message: string }>(
    `/api/v1/vdr/public/${token}/submit`,
    { method: "POST" },
  );
}

// ============================================================
// Bbox Lab (Gemini bbox extraction on PDFs)
// ============================================================

export interface BboxLabFile {
  id: string;
  filename: string;
  gcs_uri: string;
}

export interface BboxLabEntry {
  box_2d: number[];
  label: string;
  page?: number;
}

export interface BboxLabRequest {
  gcs_uri: string;
  model?: "flash" | "pro";
  pages?: number[];
  media_resolution?: "low" | "medium" | "high" | "ultra_high";
  use_agentic_vision?: boolean;
}

export interface BboxLabResponse {
  model_used: string;
  gcs_uri: string;
  entries: BboxLabEntry[];
  agentic_vision: boolean;
  raw_token_usage?: {
    prompt_tokens?: number;
    candidates_tokens?: number;
    total_tokens?: number;
  } | null;
}

export async function listBboxLabFiles(
  projectId: string,
): Promise<BboxLabFile[]> {
  return request<BboxLabFile[]>(`/bbox-lab/files/${projectId}`, {
    method: "GET",
  });
}

export async function extractBboxes(
  body: BboxLabRequest,
): Promise<BboxLabResponse> {
  return request<BboxLabResponse>("/bbox-lab/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface AskCitation {
  box_2d: number[];
  label: string;
  page: number;
}

export interface AskResponse {
  answer: string;
  citations: AskCitation[];
  model_used: string;
  raw_token_usage?: {
    prompt_tokens?: number;
    candidates_tokens?: number;
    total_tokens?: number;
  } | null;
}

export async function askDocument(
  files: File[],
  question: string,
): Promise<AskResponse> {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  formData.append("question", question);
  const res = await fetch(`${API_BASE}/bbox-lab/ask`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  return res.json();
}

// ============================================================
// AI Chat — conversations + persistent history
// ============================================================

export interface ConversationOut {
  id: string;
  title: string | null;
  project_id: string | null;
  project_title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageOut {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AskCitation[] | null;
  tokens?: number | null;
  file_names?: string[] | null;
  created_at: string;
}

export interface ProjectFileOut {
  id: string;
  filename: string;
  gcs_uri: string;
}

export interface ConversationDetail extends ConversationOut {
  messages: ConversationMessageOut[];
  project_files?: ProjectFileOut[] | null;
}

export interface AiAskResponse extends AskResponse {
  conversation_id: string;
}

export async function createConversation(opts?: {
  project_id?: string;
  title?: string;
}): Promise<ConversationOut> {
  return request<ConversationOut>("/ai/conversations", {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  });
}

export async function listConversations(): Promise<ConversationOut[]> {
  return request<ConversationOut[]>("/ai/conversations", { method: "GET" });
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/ai/conversations/${id}`, {
    method: "GET",
  });
}

export async function updateConversation(
  id: string,
  body: { title?: string; project_id?: string; clear_project?: boolean },
): Promise<ConversationOut> {
  return request<ConversationOut>(`/ai/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return request<void>(`/ai/conversations/${id}`, { method: "DELETE" });
}

export async function askInConversation(
  convId: string,
  question: string,
  files?: File[],
  model: "flash" | "pro" = "flash",
): Promise<AiAskResponse> {
  const formData = new FormData();
  formData.append("question", question);
  formData.append("model", model);
  if (files) {
    for (const f of files) formData.append("files", f);
  }
  const res = await fetch(
    `${API_BASE}/ai/conversations/${convId}/ask`,
    { method: "POST", credentials: "include", body: formData },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function askInConversationStream(
  convId: string,
  question: string,
  model: "flash" | "pro",
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const formData = new FormData();
  formData.append("question", question);
  formData.append("model", model);

  const res = await fetch(`${API_BASE}/ai/conversations/${convId}/ask-stream`, {
    method: "POST",
    credentials: "include",
    body: formData,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = JSON.parse(line.slice(6)) as {
        type: "chunk" | "done" | "error";
        text?: string;
        message?: string;
      };
      if (payload.type === "chunk" && payload.text) onChunk(payload.text);
      else if (payload.type === "error") throw new Error(payload.message ?? "Stream error");
    }
  }
}

// ============================================================
// Agent session events (post-check diagnostics)
// ============================================================

export async function getCheckSessionEvents(
  projectId: string,
  checkId: string,
  numRecentEvents = 200,
): Promise<import("./types").AgentSessionEventsResponse> {
  return request<import("./types").AgentSessionEventsResponse>(
    `/projects/${projectId}/results/${checkId}/session?num_recent_events=${numRecentEvents}`,
    { method: "GET" },
  );
}

// ============================================================
// Export
// ============================================================

/**
 * Download a DD check report as a PDF file (server-rendered, Hebrew RTL).
 * Returns a { blob, filename } pair ready for programmatic download.
 */
export async function exportReportToPdf(
  projectId: string,
  checkId: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/results/${checkId}/export/pdf`,
    { method: "GET", credentials: "include" },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? "PDF export failed");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ??
    disposition.match(/filename="?([^";]+)"?/i);
  const filename = match
    ? decodeURIComponent(match[1])
    : `report_${checkId}.pdf`;

  return { blob, filename };
}

/**
 * Download a DD check report as a Word (.docx) file.
 * Returns a { blob, filename } pair ready for programmatic download.
 */
export async function exportReportToWord(
  projectId: string,
  checkId: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/results/${checkId}/export/word`,
    { method: "GET", credentials: "include" },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? "Export failed");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ??
    disposition.match(/filename="?([^";]+)"?/i);
  const filename = match
    ? decodeURIComponent(match[1])
    : `report_${checkId}.docx`;

  return { blob, filename };
}

// ── Checklist ─────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
}

export interface PublicChecklist {
  project_name: string;
  items: ChecklistItem[];
}

export async function listChecklist(projectId: string): Promise<ChecklistItem[]> {
  return request<ChecklistItem[]>(`/projects/${projectId}/checklist`);
}

export async function generateChecklist(projectId: string): Promise<ChecklistItem[]> {
  return request<ChecklistItem[]>(`/projects/${projectId}/checklist/generate`, {
    method: "POST",
  });
}

export async function addChecklistItem(
  projectId: string,
  data: { category: string; title: string; description?: string },
): Promise<ChecklistItem> {
  return request<ChecklistItem>(`/projects/${projectId}/checklist/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateChecklistItem(
  projectId: string,
  itemId: string,
  patch: { is_completed?: boolean; title?: string; description?: string; category?: string },
): Promise<ChecklistItem> {
  return request<ChecklistItem>(`/projects/${projectId}/checklist/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteChecklistItem(projectId: string, itemId: string): Promise<void> {
  await request<void>(`/projects/${projectId}/checklist/${itemId}`, { method: "DELETE" });
}

export async function exportChecklistWord(
  projectId: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/checklist/export`,
    { method: "GET", credentials: "include" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? "Export failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ??
    disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1]) : "checklist.docx";
  return { blob, filename };
}

export async function shareChecklist(
  projectId: string,
  data: { invited_email: string; message?: string },
): Promise<{ share_url: string; invited_email: string; expires_at: string; email_sent: boolean }> {
  return request(`/projects/${projectId}/checklist/share`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPublicChecklist(token: string): Promise<PublicChecklist> {
  const res = await fetch(`${API_BASE.replace("/api/v1", "")}/checklist/public/${token}`);
  if (!res.ok) throw new Error("Checklist not found or expired");
  return res.json();
}

export async function publicUploadChecklistFile(
  token: string,
  itemId: string,
  file: File,
  uploaderName: string,
): Promise<void> {
  const form = new FormData();
  form.append("item_id", itemId);
  form.append("file", file);
  form.append("uploader_name", uploaderName);
  const res = await fetch(
    `${API_BASE.replace("/api/v1", "")}/checklist/public/${token}/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error("Upload failed");
}

// ── Groups ────────────────────────────────────────────────────────────────────

export interface GroupMember {
  user_id: string;
  email: string;
  name: string | null;
}

export interface Group {
  id: string;
  name: string;
  member_count: number;
  members: GroupMember[];
}

export async function listGroups(): Promise<Group[]> {
  return request<Group[]>("/groups");
}

export async function createGroup(name: string): Promise<Group> {
  return request<Group>("/groups", { method: "POST", body: JSON.stringify({ name }) });
}

export async function renameGroup(groupId: string, name: string): Promise<Group> {
  return request<Group>(`/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await request<void>(`/groups/${groupId}`, { method: "DELETE" });
}

export async function addGroupMember(groupId: string, email: string): Promise<GroupMember> {
  return request<GroupMember>(`/groups/${groupId}/members`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await request<void>(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

export async function addGroupToProject(
  groupId: string,
  projectId: string,
): Promise<{ added: number; skipped: number }> {
  return request<{ added: number; skipped: number }>(
    `/groups/${groupId}/add-to-project/${projectId}`,
    { method: "POST" },
  );
}

// ── Report Comments ──────────────────────────────────────────────────────────

export interface ReportComment {
  id: string;
  section_key: string;
  content: string;
  author_name: string | null;
  author_email: string | null;
  created_at: string;
}

export async function listReportComments(projectId: string): Promise<ReportComment[]> {
  return request<ReportComment[]>(`/projects/${projectId}/comments`);
}

export async function addReportComment(
  projectId: string,
  sectionKey: string,
  content: string,
): Promise<ReportComment> {
  return request<ReportComment>(`/projects/${projectId}/comments`, {
    method: "POST",
    body: JSON.stringify({ section_key: sectionKey, content }),
  });
}

export async function deleteReportComment(
  projectId: string,
  commentId: string,
): Promise<void> {
  await request<void>(`/projects/${projectId}/comments/${commentId}`, { method: "DELETE" });
}

// ── Organization language ──────────────────────────────────────────────────

export async function getOrgLanguage(): Promise<{ language: string }> {
  return request<{ language: string }>("/organization/language");
}

export async function setOrgLanguage(language: "he" | "en"): Promise<{ language: string }> {
  return request<{ language: string }>("/organization/language", {
    method: "PATCH",
    body: JSON.stringify({ language }),
  });
}

// ── Custom Agent Builder ──────────────────────────────────────────────────────

export async function startBuilderSession(): Promise<{ agent_id: string }> {
  return request<{ agent_id: string }>("/agents/builder/start", { method: "POST" });
}

export async function listAgents(): Promise<CustomAgent[]> {
  return request<CustomAgent[]>("/agents");
}

export async function getAgent(agentId: string): Promise<CustomAgent> {
  return request<CustomAgent>(`/agents/${agentId}`);
}

export async function configureAgent(
  agentId: string,
  data: { name: string; system_prompt: string; description?: string },
): Promise<CustomAgent> {
  return request<CustomAgent>(`/agents/${agentId}/configure`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function publishAgent(agentId: string): Promise<CustomAgent> {
  return request<CustomAgent>(`/agents/${agentId}/publish`, { method: "POST" });
}

export async function initiateAgentFileUpload(
  agentId: string,
  filename: string,
  contentType: string,
  fileSizeBytes?: number,
): Promise<{ upload_url: string; file_id: string; gcs_uri: string }> {
  return request(`/agents/builder/${agentId}/files/initiate`, {
    method: "POST",
    body: JSON.stringify({ filename, content_type: contentType, file_size_bytes: fileSizeBytes }),
  });
}

export async function completeAgentFileUpload(
  agentId: string,
  fileId: string,
  originalName: string,
  gcsUri: string,
  fileSizeBytes?: number,
): Promise<CustomAgent> {
  return request(`/agents/builder/${agentId}/files/complete`, {
    method: "POST",
    body: JSON.stringify({
      file_id: fileId,
      original_name: originalName,
      gcs_uri: gcsUri,
      file_size_bytes: fileSizeBytes,
    }),
  });
}

/**
 * Returns the raw fetch Response so the caller can read the SSE body stream.
 * The caller must consume `response.body` as a ReadableStream.
 */
export async function sendBuilderMessage(
  agentId: string,
  message: string,
  attachedFileIds: string[] = [],
): Promise<Response> {
  const url = `${API_BASE}/agents/builder/${agentId}/chat`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, attached_file_ids: attachedFileIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(detailMessage(body) || `HTTP ${res.status}`);
  }
  return res;
}

export async function runAgent(agentId: string, projectId: string): Promise<Response> {
  const url = `${API_BASE}/agents/${agentId}/run`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(detailMessage(body) || `HTTP ${res.status}`);
  }
  return res;
}

export async function runAgentUpload(agentId: string, files: File[]): Promise<Response> {
  const url = `${API_BASE}/agents/${agentId}/run-upload`;
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch(url, { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(detailMessage(body) || `HTTP ${res.status}`);
  }
  return res;
}

export async function renameAgent(agentId: string, name: string): Promise<void> {
  await request(`/agents/${agentId}`, { method: "PATCH", body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" } });
}

export async function deleteAgent(agentId: string): Promise<void> {
  await request(`/agents/${agentId}`, { method: "DELETE" });
}

export async function exportAgentOutput(agentId: string, content: string, format: "docx" | "xlsx"): Promise<Blob> {
  const url = `${API_BASE}/agents/${agentId}/export`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, format }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(detailMessage(body) || `HTTP ${res.status}`);
  }
  return res.blob();
}

// ── Notebooks ────────────────────────────────────────────────────────────────

export async function createNotebook(title = "Untitled Notebook"): Promise<import("./types").NotebookDetail> {
  return request("/notebooks", { method: "POST", body: JSON.stringify({ title }), headers: { "Content-Type": "application/json" } });
}

export async function listNotebooks(): Promise<import("./types").NotebookListItem[]> {
  return request("/notebooks");
}

export async function getNotebook(id: string): Promise<import("./types").NotebookDetail> {
  return request(`/notebooks/${id}`);
}

export async function renameNotebook(id: string, title: string): Promise<import("./types").NotebookListItem> {
  return request(`/notebooks/${id}`, { method: "PATCH", body: JSON.stringify({ title }), headers: { "Content-Type": "application/json" } });
}

export async function deleteNotebook(id: string): Promise<void> {
  await request(`/notebooks/${id}`, { method: "DELETE" });
}

export async function autoNameNotebook(id: string): Promise<import("./types").NotebookListItem> {
  return request(`/notebooks/${id}/auto-name`, { method: "POST" });
}

export async function uploadNotebookSources(id: string, files: File[]): Promise<import("./types").NotebookSource[]> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return request(`/notebooks/${id}/sources`, { method: "POST", body: form });
}

export async function deleteNotebookSource(notebookId: string, sourceId: string): Promise<void> {
  await request(`/notebooks/${notebookId}/sources/${sourceId}`, { method: "DELETE" });
}

export async function chatNotebook(notebookId: string, message: string): Promise<Response> {
  const url = `${API_BASE}/notebooks/${notebookId}/chat`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(detailMessage(body) || `HTTP ${res.status}`);
  }
  return res;
}

export async function clearNotebookChat(notebookId: string): Promise<void> {
  await request(`/notebooks/${notebookId}/chat`, { method: "DELETE" });
}

export async function generateNotebookAudio(
  notebookId: string,
): Promise<{ type: "audio"; blob: Blob } | { type: "script"; script: string }> {
  const url = `${API_BASE}/notebooks/${notebookId}/audio`;
  const res = await fetch(url, { method: "POST", credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(detailMessage(body) || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.startsWith("audio/")) {
    return { type: "audio", blob: await res.blob() };
  }
  const json = await res.json();
  return { type: "script", script: json.script ?? "" };
}

export async function uploadChecklistFile(
  projectId: string,
  itemId: string,
  file: File,
): Promise<{ status: string; item_id: string; file_name: string }> {
  const form = new FormData();
  form.append("file", file);
  return request(`/projects/${projectId}/checklist/${itemId}/upload`, {
    method: "POST",
    body: form,
  });
}
