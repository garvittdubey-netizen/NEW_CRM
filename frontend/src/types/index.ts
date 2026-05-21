// Core application types

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';
  profileImage?: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  error: string;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

// ── Lead Module ──────────────────────────────────────────────────────────────

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'NEGOTIATING' | 'WON' | 'LOST';

export type LeadSource =
  | 'FACEBOOK'
  | 'WHATSAPP'
  | 'WEBSITE'
  | 'REFERRAL'
  | 'MANUAL'
  | 'PROPERTY_PORTAL'
  | 'OTHER';

export interface Lead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  budget: number | null;
  preferredLocation: string | null;
  bhk: string | null;
  propertyType: string | null;
  status: LeadStatus;
  source: LeadSource;
  tags: string[];
  notes: string | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsResponse {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateLeadData {
  fullName: string;
  phone?: string;
  email?: string;
  budget?: number | null;
  preferredLocation?: string;
  bhk?: string;
  propertyType?: string;
  status?: LeadStatus;
  source?: LeadSource;
  tags?: string[];
  notes?: string;
  assignedAgentId?: string | null;
}

export type UpdateLeadData = Partial<CreateLeadData>;

// ── Follow-Up Module ─────────────────────────────────────────────────────────

export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'MISSED';

export interface FollowUp {
  id: string;
  leadId: string;
  lead: {
    id: string;
    fullName: string;
    status: LeadStatus;
    phone: string | null;
  };
  assignedAgentId: string;
  assignedAgent: { id: string; name: string; email: string };
  followUpDate: string;
  reminderDate: string | null;
  status: FollowUpStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpsResponse {
  followUps: FollowUp[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateFollowUpData {
  leadId: string;
  assignedAgentId: string;
  followUpDate: string;
  reminderDate?: string | null;
  status?: FollowUpStatus;
  notes?: string | null;
}

export type UpdateFollowUpData = Partial<CreateFollowUpData>;

export interface FollowUpDashboardStats {
  today: number;
  overdue: number;
  upcoming: number;
}

// ── Communication Module ─────────────────────────────────────────────────────

export type CommunicationType = 'WHATSAPP' | 'CALL';
export type CommunicationDirection = 'INBOUND' | 'OUTBOUND';

export interface Communication {
  id: string;
  leadId: string;
  lead?: { id: string; fullName: string; phone: string | null; assignedAgentId: string | null };
  type: CommunicationType;
  direction: CommunicationDirection | null;
  message: string | null;
  templateName: string | null;
  templateLang: string | null;
  templateParams: string[] | null;
  callDuration: number | null;
  callOutcome: string | null;
  status: string;
  whatsappMessageId: string | null;
  errorCode: number | null;
  errorDetail: string | null;
  createdById: string | null;
  createdBy: { id: string; name: string; email: string; role: UserRole } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationsResponse {
  communications: Communication[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ConversationSummary {
  leadId: string;
  leadName: string;
  phone: string | null;
  status: LeadStatus;
  lastMessage: {
    id: string;
    type: CommunicationType;
    direction: CommunicationDirection | null;
    message: string | null;
    status: string;
    createdAt: string;
  } | null;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  bodyText?: string;
  bodyParamCount: number;
}

export interface SendWhatsAppPayload {
  leadId: string;
  message?: string;
  /** Optional public image URL — sent as a native WhatsApp image attachment
   *  BEFORE the text body. Used by the Property → Share workflow. */
  imageUrl?: string;
  templateName?: string;
  templateLang?: string;
  templateParams?: string[];
}

export interface LogCallPayload {
  leadId: string;
  callOutcome: string;
  callDuration?: number;
  notes?: string;
}

// ── Activity Module ──────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string; role: UserRole };
  leadId: string | null;
  lead: { id: string; fullName: string } | null;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivitiesResponse {
  activities: Activity[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Dashboard Analytics Module ───────────────────────────────────────────────

export type AnalyticsRange = 'today' | '7d' | '30d' | 'custom';

export interface AnalyticsRangeParams {
  range: AnalyticsRange;
  from?: string;
  to?: string;
}

export interface AnalyticsOverview {
  range: { from: string; to: string; label: AnalyticsRange };
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  /** 0..100, two decimals */
  conversionRate: number;
}

export interface LeadStatusBucket {
  status: LeadStatus;
  count: number;
}

export interface LeadsByStatusResponse {
  data: LeadStatusBucket[];
}

export interface LeadSourceBucket {
  source: LeadSource;
  count: number;
}

export interface LeadsBySourceResponse {
  data: LeadSourceBucket[];
}

export interface FollowUpStatusBucket {
  status: FollowUpStatus;
  count: number;
}

export interface FollowUpAnalytics {
  byStatus: FollowUpStatusBucket[];
  total: number;
  completed: number;
  /** 0..100, two decimals */
  completionRate: number;
}

export interface AgentPerformanceRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  assignedLeads: number;
  contactedLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
}

export interface AgentPerformanceResponse {
  data: AgentPerformanceRow[];
}

export interface CommunicationStats {
  messagesSent: number;
  messagesReceived: number;
  callsLogged: number;
  total: number;
}

// ── Property Module ──────────────────────────────────────────────────────────

export type PropertyStatus = 'AVAILABLE' | 'SOLD' | 'RESERVED';

export type AreaUnit = 'SQFT' | 'SQM';

export interface Property {
  id: string;
  title: string;
  propertyType: string;
  location: string;
  city: string;
  price: number;
  area: number;
  areaUnit: AreaUnit;
  bedrooms: number | null;
  bathrooms: number | null;
  status: PropertyStatus;
  description: string | null;
  images: string[];
  ownerAgentId: string | null;
  ownerAgent: { id: string; name: string; email: string; role: UserRole } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertiesResponse {
  properties: Property[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreatePropertyData {
  title: string;
  propertyType: string;
  location: string;
  city: string;
  price: number;
  area: number;
  areaUnit?: AreaUnit;
  bedrooms?: number | null;
  bathrooms?: number | null;
  status?: PropertyStatus;
  description?: string;
  images?: string[];
  ownerAgentId?: string | null;
}

export type UpdatePropertyData = Partial<CreatePropertyData>;

export interface MatchingLead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  source: LeadSource;
  preferredLocation: string | null;
  propertyType: string | null;
  budget: number | null;
  assignedAgent: { id: string; name: string; email: string } | null;
  nextFollowUp: { id: string; followUpDate: string; status: FollowUpStatus } | null;
  matchScore: number;
}

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  uploadUrl: string;
}

// ── Client Module ────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  budget: number | null;
  preferredLocation: string | null;
  notes: string | null;
  linkedLeadId: string | null;
  linkedLead: { id: string; fullName: string; status: LeadStatus; phone: string | null } | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string; email: string; role: UserRole } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsResponse {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateClientData {
  fullName: string;
  phone?: string;
  email?: string;
  budget?: number | null;
  preferredLocation?: string;
  notes?: string;
  linkedLeadId?: string | null;
  assignedAgentId?: string | null;
}

export type UpdateClientData = Partial<CreateClientData>;

export type ClientTimelineSource = 'CLIENT' | 'COMMUNICATION' | 'FOLLOWUP' | 'ACTIVITY' | 'DEAL';

export interface ClientTimelineItem {
  id: string;
  source: ClientTimelineSource;
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

// ── Deal Module ──────────────────────────────────────────────────────────────

export type DealStatus =
  | 'NEW'
  | 'NEGOTIATION'
  | 'DOCUMENTATION'
  | 'PAYMENT_PENDING'
  | 'WON'
  | 'LOST';

export interface Deal {
  id: string;
  title: string;
  propertyId: string;
  property: {
    id: string;
    title: string;
    city: string;
    location: string;
    price: number | null;
    images: string[];
    status: string;
  } | null;
  clientId: string;
  client: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  } | null;
  assignedAgentId: string;
  assignedAgent: { id: string; name: string; email: string; role: UserRole } | null;
  amount: number;
  expectedClosingDate: string | null;
  status: DealStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealsResponse {
  deals: Deal[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateDealData {
  title: string;
  propertyId: string;
  clientId: string;
  assignedAgentId?: string | null;
  amount: number;
  expectedClosingDate?: string | null;
  status?: DealStatus;
  notes?: string;
}

export type UpdateDealData = Partial<CreateDealData>;

// Deal timeline — read-only lifecycle events sourced from `deal_activities`.
export type DealEventType =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'AMOUNT_UPDATED'
  | 'AGENT_REASSIGNED'
  | 'NOTES_UPDATED';

export interface DealTimelineItem {
  id: string;
  source: 'DEAL';
  eventType: DealEventType | string;
  notes: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}
