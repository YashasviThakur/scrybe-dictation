export type Preset = {
  id: string;
  label: string;
  description: string;
  instruction: string;
  /** Letterhead shown atop the finished-document card. */
  letterhead: string;
  /** Paper texture for the finished-document card. */
  texture: "plain" | "ruled" | "grid";
  /** Whether to show an auto-derived "Re:" subject line drawn from the rewrite. */
  showSubject?: boolean;
};

export const PRESETS: Preset[] = [
  {
    id: "notes",
    label: "Clean Notes",
    description: "Tidy, punctuated notes with filler words removed",
    instruction:
      "Rewrite as clean, well-punctuated notes. Remove filler words and false starts but keep all factual content and the speaker's original wording where possible.",
    letterhead: "Notes",
    texture: "ruled",
  },
  {
    id: "email",
    label: "Email Draft",
    description: "Polished, professional email tone",
    instruction:
      "Rewrite as a polished, professional email. Fix grammar, remove filler words, and use a friendly professional tone. Do not invent a subject line or greeting unless one was dictated.",
    letterhead: "Draft email",
    texture: "plain",
    showSubject: true,
  },
  {
    id: "meeting",
    label: "Meeting Minutes",
    description: "Short bullet points: decisions and action items",
    instruction:
      "Rewrite as concise meeting minutes using short bullet points. Remove filler words and keep only decisions, action items, and key points.",
    letterhead: "Meeting minutes",
    texture: "plain",
  },
  {
    id: "soap",
    label: "Clinical SOAP Note",
    description: "Subjective / Objective / Assessment / Plan format",
    instruction:
      "Rewrite as a clinical SOAP note (Subjective, Objective, Assessment, Plan) using standard clinical documentation language. Only include sections supported by the dictated content.",
    letterhead: "Clinical note",
    texture: "grid",
  },
  {
    id: "verbatim",
    label: "Verbatim Only",
    description: "Exact words, no cleanup",
    instruction: "Return the transcript exactly as spoken, with no changes, corrections, or filler-word removal.",
    letterhead: "Verbatim",
    texture: "plain",
  },
];

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "vi", label: "Vietnamese" },
];
