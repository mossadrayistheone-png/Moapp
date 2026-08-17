// ── Tappable prompt suggestions per mode ────────────────────────────────────

export interface PromptCategory {
  id: string;
  title: string;
  icon: string;
  prompts: string[];
  morePrompts: string[];
}

export const DAILY_PROMPTS: PromptCategory[] = [
  {
    id: "daily-life",
    title: "Daily Life",
    icon: "☀",
    prompts: [
      "What's on my schedule today?",
      "Remind me to call my doctor at 3pm.",
      "Make a shopping list for dinner tonight.",
      "Help me plan my day.",
    ],
    morePrompts: [
      "Create a to-do list for this week.",
      "What should I prioritize today?",
      "Help me build a morning routine.",
      "Set a reminder for my meeting tomorrow.",
    ],
  },
  {
    id: "health",
    title: "Health & Wellness",
    icon: "🌿",
    prompts: [
      "Build a healthy meal plan for the week.",
      "Help me drink more water today.",
      "Create a simple walking plan.",
      "Track my habits and build consistency.",
    ],
    morePrompts: [
      "What are some quick healthy breakfast ideas?",
      "Help me reduce screen time before bed.",
      "Suggest a 10-minute morning stretch routine.",
      "How do I improve my sleep quality?",
    ],
  },
  {
    id: "home",
    title: "Home",
    icon: "🏠",
    prompts: [
      "Give me a weekly cleaning checklist.",
      "Help me create a monthly budget.",
      "Meal prep ideas for the week.",
      "Plan my grocery shopping.",
    ],
    morePrompts: [
      "How do I organise my pantry?",
      "Help me declutter my wardrobe.",
      "What home repairs should I tackle this weekend?",
      "Create a home maintenance calendar.",
    ],
  },
  {
    id: "creativity",
    title: "Creativity",
    icon: "✦",
    prompts: [
      "Help me brainstorm ideas for a project.",
      "Write something creative for me.",
      "Generate a social media post.",
      "Help me learn something new today.",
    ],
    morePrompts: [
      "Suggest a new hobby I could pick up.",
      "Write a short poem about my day.",
      "Help me start journaling.",
      "Give me a creative challenge for today.",
    ],
  },
];

export const EXECUTIVE_PROMPTS: PromptCategory[] = [
  {
    id: "productivity",
    title: "Productivity",
    icon: "◆",
    prompts: [
      "Organise my day for maximum output.",
      "Help me prioritise my tasks right now.",
      "Build a project plan for this week.",
      "Summarise the key points from a document.",
    ],
    morePrompts: [
      "What are the most important things I should focus on?",
      "Help me eliminate distractions and stay focused.",
      "Create a time-blocking schedule for today.",
      "Review my commitments and suggest cuts.",
    ],
  },
  {
    id: "business",
    title: "Business",
    icon: "◈",
    prompts: [
      "Brainstorm business ideas in my industry.",
      "Draft a professional email.",
      "Research a company for me.",
      "Create a meeting agenda.",
    ],
    morePrompts: [
      "Help me prepare for a difficult conversation.",
      "Write a concise executive summary.",
      "Analyse the pros and cons of a decision.",
      "Draft a proposal for a new initiative.",
    ],
  },
  {
    id: "finance",
    title: "Finance",
    icon: "◇",
    prompts: [
      "Help me build a budget plan.",
      "Track my expenses this month.",
      "Give me revenue growth ideas.",
      "Research an investment opportunity.",
    ],
    morePrompts: [
      "What financial habits should I build?",
      "Help me reduce unnecessary expenses.",
      "Explain a financial concept to me.",
      "Build a simple cash flow model.",
    ],
  },
  {
    id: "leadership",
    title: "Leadership",
    icon: "◉",
    prompts: [
      "How do I improve team communication?",
      "Help me prepare for an important meeting.",
      "Walk me through a decision analysis.",
      "Help me with strategic planning.",
    ],
    morePrompts: [
      "How do I give better feedback?",
      "Help me delegate more effectively.",
      "What makes a great leader?",
      "Draft a vision statement for my team.",
    ],
  },
];

export const LUXURY_PROMPTS: PromptCategory[] = [
  {
    id: "concierge",
    title: "Concierge",
    icon: "◈",
    prompts: [
      "Find me a luxury hotel for next weekend.",
      "Recommend a fine dining restaurant nearby.",
      "Plan a weekend getaway for two.",
      "Suggest an exclusive experience I haven't tried.",
    ],
    morePrompts: [
      "Help me secure a hard-to-get reservation.",
      "What are the best luxury spas in the world?",
      "Recommend a private villa for a holiday.",
      "Find a Michelin-starred restaurant with availability.",
    ],
  },
  {
    id: "travel",
    title: "Travel",
    icon: "◆",
    prompts: [
      "Build a luxury travel itinerary for me.",
      "What are the best first-class flight options?",
      "Recommend a VIP destination for this season.",
      "Create a curated packing list.",
    ],
    morePrompts: [
      "What are the most exclusive resorts in Asia?",
      "Plan a private island escape.",
      "Recommend a yacht charter destination.",
      "What's the best time to visit the Maldives?",
    ],
  },
  {
    id: "lifestyle",
    title: "Lifestyle",
    icon: "◇",
    prompts: [
      "Recommend luxury shopping for this season.",
      "Tell me about exceptional timepieces right now.",
      "Give me fashion advice for an event.",
      "Recommend a vehicle worth considering.",
    ],
    morePrompts: [
      "What are the finest spirits worth collecting?",
      "Help me curate a personal art collection.",
      "Recommend a bespoke tailor.",
      "What luxury brands are trending this season?",
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    icon: "○",
    prompts: [
      "Find exclusive events happening near me.",
      "Recommend upcoming concerts worth attending.",
      "Plan a private experience for a special occasion.",
      "Inspire my weekend.",
    ],
    morePrompts: [
      "What cultural events are worth travelling for?",
      "Recommend a private chef experience.",
      "Find me a unique after-dinner experience.",
      "What's worth seeing at auction this season?",
    ],
  },
];
