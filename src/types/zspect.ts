export type PinType = 'bug' | 'ui-polish' | 'copy' | 'design-diff' | 'a11y' | 'visual-tweak';
export type PinSeverity = 'critical' | 'high' | 'medium' | 'low';
export type PinStatus = 'open' | 'in-progress' | 'resolved';

export type InspectorToolMode =
  | 'inspect'
  | 'area'
  | 'guides'
  | 'a11y'
  | 'spacing'
  | 'flexbox'
  | 'text-edit'
  | 'freeze'
  | 'diff';

export type IdeTarget = 'cursor' | 'vscode' | 'windsurf';
export type PromptDensity = 'compact' | 'standard' | 'forensic';

export interface SessionRecord {
  id: string;
  title: string;
  activeTabCollection: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SourceLocation {
  filePath: string;
  line: number;
  column?: number;
}

export interface FrameworkMeta {
  framework: 'react' | 'vue' | 'svelte' | 'astro' | 'angular' | 'unknown';
  componentName?: string;
  componentStack: string[];
  sourceLocation?: SourceLocation;
  sanitizedProps?: Record<string, unknown>;
}

export interface BreadcrumbItem {
  ts: number;
  action: 'click' | 'input' | 'submit' | 'navigate';
  targetLabel: string;
}

export interface ConsoleErrorItem {
  ts: number;
  level: 'error' | 'warn';
  message: string;
  stack?: string;
}

export interface NetworkIssueItem {
  ts: number;
  method: string;
  url: string;
  status: number | 'NETWORK_ERROR';
  durationMs: number;
  responseSnippet?: string;
}

export interface FlightCapsule {
  breadcrumbs: BreadcrumbItem[];
  consoleErrors: ConsoleErrorItem[];
  networkIssues: NetworkIssueItem[];
}

export interface StyleChangeEntry {
  property: string;
  before: string;
  after: string;
}

export interface VisualTweakDiff {
  styleChanges: StyleChangeEntry[];
  tailwindBefore?: string;
  tailwindAfter?: string;
  textChange?: { before: string; after: string };
  domMoved?: { fromIndex: number; toIndex: number };
}

export interface A11yAuditSnapshot {
  contrastRatio: number;
  wcagAA: boolean;
  wcagAAA: boolean;
  isLargeText: boolean;
  foregroundColor: string;
  effectiveBackgroundColor: string;
  role?: string;
  accessibleName?: string;
  touchTargetPass: boolean;
  dimensions: { width: number; height: number };
  issues: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageX?: number;
  pageY?: number;
}

export interface PinRecord {
  id: string;
  sessionId: string;
  orderIndex: number;
  type: PinType;
  severity: PinSeverity;
  status: PinStatus;
  note: string;
  selectedText?: string;
  pageUrl: string;
  pageTitle: string;
  viewport: { width: number; height: number; dpr: number };
  boundingBox: BoundingBox;
  selector: string;
  extraSelectors?: string[];
  cleanHtml: string;
  computedStyles: Record<string, string>;
  resolvedCssVars?: Record<string, string>;
  tailwindHint?: string;
  frameworkMeta: FrameworkMeta;
  visualDiff?: VisualTweakDiff;
  a11yAudit?: A11yAuditSnapshot;
  flightCapsule?: FlightCapsule;
  attachedRefIds: string[];
  croppedImageBlob?: Blob;
  fullViewportBlob?: Blob;
  createdAt: number;
}

export interface MotionRules {
  transitions: string[];
  animations: string[];
  keyframesCss: string[];
}

export interface ReferenceDNA {
  id: string;
  alias: string;
  sourceUrl: string;
  sourceTitle?: string;
  domSkeleton: string;
  resolvedCssVars: Record<string, string>;
  layoutStyles: Record<string, string>;
  visualStyles: Record<string, string>;
  typographyStyles: Record<string, string>;
  pseudoElements: {
    before?: Record<string, string>;
    after?: Record<string, string>;
  };
  motionRules: MotionRules;
  tailwindHint: string;
  previewBlob?: Blob;
  createdAt: number;
}

export interface AnimationSummary {
  id: string;
  name: string;
  durationMs: number;
  currentTimeMs: number;
  playState: AnimationPlayState;
  easing: string;
}

export type CdpPseudoState = 'hover' | 'focus' | 'active' | 'focus-within';

export type ZSpectRuntimeMessage =
  | { type: 'ZSPECT_TOGGLE_HUD' }
  | { type: 'ZSPECT_FREEZE_HOTKEY' }
  | { type: 'ZSPECT_OPEN_SIDEPANEL' }
  | {
      type: 'ZSPECT_CAPTURE_REGION';
      rect: BoundingBox;
      viewport: { width: number; height: number; dpr: number };
      badgeNumber?: number;
      accentColor?: string;
    }
  | {
      type: 'ZSPECT_CAPTURE_FULL_VIEWPORT';
    }
  | {
      type: 'ZSPECT_CDP_FORCE_PSEUDO';
      selector: string;
      states: CdpPseudoState[];
      enable: boolean;
    }
  | {
      type: 'ZSPECT_OFFSCREEN_CROP';
      dataUrl: string;
      rect: BoundingBox;
      viewport: { width: number; height: number; dpr: number };
      badgeNumber?: number;
      accentColor?: string;
    }
  | {
      type: 'ZSPECT_DB_UPDATED';
      entity: 'pins' | 'references' | 'sessions';
      sessionId?: string;
    }
  | {
      type: 'ZSPECT_SCROLL_TO_PIN';
      selector: string;
      pageX?: number;
      pageY?: number;
    }
  | {
      type: 'ZSPECT_GET_HUD_STATE';
      pageUrl: string;
    }
  | {
      type: 'ZSPECT_CREATE_PIN_FROM_HUD';
      pinDraft: Omit<PinRecord, 'id' | 'sessionId' | 'orderIndex' | 'createdAt' | 'croppedImageBlob' | 'fullViewportBlob'>;
      captureRect: BoundingBox;
      accentColor?: string;
    }
  | {
      type: 'ZSPECT_CREATE_REF_FROM_HUD';
      refDraft: Omit<ReferenceDNA, 'id' | 'createdAt' | 'previewBlob'>;
      captureRect: BoundingBox;
    };

export type ProbeRequestMessage =
  | { id: string; action: 'INSPECT_ELEMENT'; selector: string }
  | { id: string; action: 'GET_FLIGHT_CAPSULE' }
  | { id: string; action: 'LIST_ANIMATIONS'; selector?: string }
  | { id: string; action: 'SCRUB_ANIMATIONS'; progress: number; pause: boolean; selector?: string }
  | { id: string; action: 'RESUME_ANIMATIONS' };

export interface ProbeResponseMessage {
  id: string;
  ok: boolean;
  frameworkMeta?: FrameworkMeta;
  flightCapsule?: FlightCapsule;
  animations?: AnimationSummary[];
  error?: string;
}
