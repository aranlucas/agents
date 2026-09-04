/**
 * Structured resume content for the `/resume` page.
 *
 * Canonical source is `agents/resume/resume.md` (embedded by the Go resume
 * agent via `agents/resume/assets.go`). This file is a typed transcription so
 * the web app can render it without runtime filesystem reads. When updating
 * experience, keep both files in sync.
 */

export type ResumeLink = { label: string; href: string };

export type ResumeRole = {
  company: string;
  title: string;
  location: string;
  dates: string;
  bullets: string[];
  links?: ResumeLink[];
  projects?: { name: string; description: string }[];
};

export const RESUME_BASICS = {
  name: "Lucas Arango",
  title: "Senior Software Engineer — AI products & agents",
  location: "Seattle, Washington",
  email: "aranlucas@gmail.com",
  phone: "(786) 259-7659",
  linkedin: "https://www.linkedin.com/in/lucasarango/",
  github: "https://github.com/aranlucas",
  summary:
    "Software engineer with 10+ years shipping products at DoorDash, Amazon, and AWS, operating at staff scope: originating products from prototype to launch, setting performance and reliability standards adopted org-wide, and leading through influence across engineering, ML, product, design, and operations. Most recently pitched, prototyped, and led Ask DoorDash, the company's conversational AI shopping experience.",
  lookingFor:
    "Senior / staff software engineer roles — big tech, AI-native, or fast-shipping product teams. Idea to launch, AI + real user problems, raising the quality bar. Not management.",
} as const;

export const RESUME_ROLES: ResumeRole[] = [
  {
    company: "DoorDash",
    title: "Senior Software Engineer",
    location: "Seattle, WA (Hybrid)",
    dates: "Oct 2023 – Present",
    bullets: [
      "Originated Ask DoorDash (launched June 2026): pitched the vision for a conversational, agent-driven shopping experience, built the prototype that secured leadership buy-in, and served as lead engineer guiding delivery across engineering, ML, product, and design — natural-language search across ~800,000 items, personalized from order history and dietary preferences.",
      "Drove DoorDash's external MCP integration for ChatGPT, extending catalog and commerce capabilities into assistant-driven discovery.",
      "Optimized DashMart warehouse and fulfillment workflows for first-party convenience and grocery.",
      "Built consumer-facing DashMart web personalization features for grocery and convenience discovery.",
      "Drove a cross-org reliability program for core ordering and test infrastructure, including multi-tenant production-like E2E testing environments.",
      "Defined org-wide performance standards — golden-path SLOs and performance-regression gates in CI.",
    ],
    links: [
      {
        label: "Ask DoorDash announcement",
        href: "https://about.doordash.com/en-us/news/ask-doordash",
      },
      {
        label: "Engineering overview",
        href: "https://careersatdoordash.com/blog/building-doordash-assistant-an-engineering-overview/",
      },
      {
        label: "E2E testing write-up",
        href: "https://careersatdoordash.com/blog/moving-e2e-testing-into-production-with-multi-tenancy-for-increased-speed-and-reliability/",
      },
    ],
    projects: [
      {
        name: "Ask DoorDash",
        description:
          "Conversational AI search for restaurants, groceries, and reservations — describe what you want, share a recipe link or cookbook photo, get personalized results.",
      },
      {
        name: "DashMart Fulfillment & Personalization",
        description:
          "Warehouse workflow optimization plus web personalization for the first-party convenience surface.",
      },
      {
        name: "System Performance & Reliability",
        description:
          "Org-wide SLOs, regression gates, and production-like test environments for high-traffic systems.",
      },
    ],
  },
  {
    company: "Career Break",
    title: "Intentional time off",
    location: "Seattle, WA",
    dates: "Jul 2022 – Oct 2023",
    bullets: [
      "Recharged, traveled, and spent time outdoors — camping and climbing in the Cascade Range.",
      "Stayed sharp through personal projects and self-directed learning before returning at DoorDash.",
    ],
  },
  {
    company: "Amazon Web Services",
    title: "Software Development Engineer, AWS IoT",
    location: "Seattle, WA",
    dates: "Jul 2019 – Jul 2022",
    bullets: [
      "Implemented and launched the public AWS IoT SiteWise Monitor control plane at re:Invent (DynamoDB, Golang, API Gateway) through operational readiness review to GA.",
      "Led the IoT Console migration from Angular to React via microfrontends with independent CDK pipelines — 5+ sub-teams shipping independently, release lead time from weeks to days.",
      "Designed and implemented SSO federation for SiteWise Monitor.",
      "Built automated canary testing with AWS Synthetics for the IoT Console.",
    ],
  },
  {
    company: "Amazon",
    title: "Software Development Engineer, Compliance Technologies",
    location: "Seattle, WA",
    dates: "Jul 2015 – Jul 2019",
    bullets: [
      "Developed and launched a secure case management and investigation platform (Ruby on Rails, Java Spring) for internal investigations — money laundering, identity theft.",
      "Hardened the platform with end-to-end encryption, granular auth, full audit logging, and secure artifact storage.",
      "Led design and development of Suspicious Transaction Report (STR/SAR) submission to the Luxembourg FIU and UK NCA — a hard regulatory requirement for payments in those markets.",
    ],
  },
  {
    company: "Amazon",
    title: "Software Development Engineer Intern",
    location: "Seattle, WA",
    dates: "May 2014 – Aug 2014",
    bullets: ["Integrated Kindle Unlimited books into Goodreads."],
  },
  {
    company: "BlackBerry",
    title: "Software Development Engineer Intern",
    location: "Sunrise, FL",
    dates: "Jan 2013 – Aug 2013",
    bullets: [
      "Developed and maintained software for BlackBerry handhelds; smoke, regression, GUI, and functional testing on device hardware.",
    ],
  },
];

export const RESUME_PROJECTS = {
  heading: "Personal Projects — Agentic Experiences",
  intro:
    "Building AI agents is my main hobby. I run a personal multi-agent platform in production, end to end:",
  bullets: [
    "Multi-agent monorepo (Google ADK-Go + AG-UI) — 11 typed Go agents behind a single Go gateway on Railway, with D1 session state and R2 artifact storage.",
    "Full-stack agent UX — Next.js + CopilotKit web console and Expo iOS/Android app speaking AG-UI, with token-level streaming and generative UI.",
    "Real-world tools and data — live Kroger and travel integrations; fitness plans from Health Connect snapshots.",
    "Cross-agent orchestration — the wellness agent delegates to grocery and fitness agents in-process over shared typed state. The grocery agent shaped the vision for Ask DoorDash.",
  ],
} as const;

export const RESUME_SKILLS = {
  technologies:
    "React, Redux, HTML5/CSS, AWS (DynamoDB, API Gateway, CDK, Synthetics), Java Spring, Ruby on Rails, Git, AI agents (Google ADK, MCP, AG-UI, CopilotKit), LLM-powered product features, system performance & scalability",
  languages: "Java, JavaScript, TypeScript, Golang, Ruby, Python, SQL",
} as const;

export const RESUME_EDUCATION = {
  school: "University of Florida",
  degree: "B.S., Computer Engineering",
  location: "Gainesville, FL",
  dates: "Sept 2010 – May 2015",
  details: "GPA 3.33 · Graduated Cum Laude",
} as const;

export const RESUME_ABOUT: string[] = [
  "Lives in Seattle. Driven by learning, growth, and creative problem-solving.",
  "Outdoors: camping and climbing in the Cascades; runs and lifts regularly.",
  "Technical leader and go-to expert — envisions products, leads teams to release, ships personalization and fulfillment improvements.",
  "Hobby grocery agent became the vision for Ask DoorDash — personal builds feed production work.",
  "Values open feedback, willingness to apologize, and recognizing the better idea.",
];
