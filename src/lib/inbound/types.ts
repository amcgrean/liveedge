// Normalized inbound email shape.
// Producers: Resend webhooks (legacy) and Microsoft Graph (current).
// Consumers: processCreditEmail / processHubbellEmail.

export type NormalizedAttachment = {
  filename:           string;
  contentType:        string;
  buffer:             Buffer;
  size?:              number;
  contentId?:         string | null;
  isInline?:          boolean;
  // For nested .eml attachments — the buffer is the raw RFC 822 content.
  isNestedEmail?:     boolean;
};

export type NormalizedInboundEmail = {
  from:        string;            // raw "Name <email>" string
  to:          string[];
  subject:     string | null;
  text:        string | null;
  html:        string | null;
  messageId:   string | null;     // Internet Message-ID header
  receivedAt:  Date;
  attachments: NormalizedAttachment[];
};
