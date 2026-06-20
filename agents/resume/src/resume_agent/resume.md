# Lucas Arango

📍 Seattle, Washington | aranlucas@gmail.com | (786) 259-7659 | linkedin.com/in/lucasarango | github.com/aranlucas

## Summary

Software engineer with 10+ years of experience shipping products at DoorDash, Amazon, and AWS, operating at staff scope: originating products from prototype to launch, setting performance and reliability standards adopted org-wide, and leading through influence across engineering, ML, product, design, and operations. Most recently pitched, prototyped, and served as lead engineer for Ask DoorDash, the company's conversational AI shopping experience — a vision that grew directly out of the agentic experiences he builds as a hobby. Looking for senior/staff software engineer roles. I'm driven by creative problem-solving, open to feedback, willing to defend ideas, and quick to acknowledge when a better approach exists.

## Experience

### DoorDash — Senior Software Engineer

**Seattle, WA (Hybrid) | Oct 2023 – Present**

- Originated **Ask DoorDash** (launched June 2026): pitched the vision for a conversational, agent-driven shopping experience, built the prototype that secured leadership buy-in, and served as lead engineer guiding delivery teams across engineering, ML, product, and design to launch — natural-language search across ~800,000 menu items and products, personalized from order history and dietary preferences ([announcement](https://about.doordash.com/en-us/news/ask-doordash), [engineering overview](https://careersatdoordash.com/blog/building-doordash-assistant-an-engineering-overview/)).
- Drove DoorDash's external MCP integration for ChatGPT, extending the company's catalog and commerce capabilities into assistant-driven discovery surfaces.
- Optimized DashMart warehouse and fulfillment workflows, improving the operational backbone for DoorDash's first-party convenience and grocery business.
- Built consumer-facing DashMart web personalization features, helping surface more relevant grocery and convenience items and improving discovery beyond restaurant ordering ([personalization context](https://careersatdoordash.com/blog/doordash-kdd-llm-assisted-personalization-framework/)).
- Drove a cross-org reliability program for core ordering and test infrastructure, including multi-tenant production-like E2E testing environments that improved delivery speed and reliability ([engineering write-up](https://careersatdoordash.com/blog/moving-e2e-testing-into-production-with-multi-tenancy-for-increased-speed-and-reliability/)).
- Defined org-wide performance standards — golden-path SLOs and performance-regression gates in CI — shifting verification work from reactive firefighting to a continuous engineering practice.

**Key projects:**

- **Ask DoorDash** — Conversational AI search for restaurants, groceries, and reservations: users describe what they want (or share a recipe link or cookbook photo) and the app builds personalized results. Lucas pitched the product, built the prototype, and was the lead engineer through release, with delivery owned across multiple teams.
- **DashMart Fulfillment & Personalization** — Optimized warehouse/fulfillment workflows and built web personalization features for DoorDash's first-party convenience and grocery surface.
- **System Performance & Reliability** — Org-wide performance standards, SLOs, regression gates, and production-like test environments for high-traffic DoorDash systems.

### Career Break

**Jul 2022 – Oct 2023**

- Took intentional time off between AWS and DoorDash to recharge, travel, and spend time outdoors — including camping and climbing in the Cascade Range.
- Stayed sharp through personal projects and self-directed learning before returning to industry at DoorDash.

### Amazon Web Services (AWS) — Software Development Engineer, AWS IoT

**Seattle, WA | Jul 2019 – Jul 2022**

- Implemented and launched the public AWS IoT SiteWise Monitor control plane at re:Invent (DynamoDB, Golang, API Gateway), taking the service through operational readiness review to GA.
- Led the AWS IoT Console migration from Angular to React via a microfrontend architecture, establishing independent CDK deployment pipelines that let 5+ sub-teams ship on their own cadence and cut release lead time from weeks to days.
- Designed and implemented SSO federation for the SiteWise Monitor application, improving security and user experience.
- Built automated canary testing with AWS Synthetics for the IoT Console, catching regressions before release and raising the quality bar for every team shipping to the console.

**Key projects:**

- **re:Invent launch for SiteWise Monitor Federation** — Delivered the SiteWise Monitor control plane publicly at AWS re:Invent.
- **Microfrontends for IoT Console** — Led the Angular-to-React migration via a microfrontend architecture, enabling independent team deployments.
- **Operation Readiness Review for SiteWise Monitor** — Led operational readiness review to ensure production-readiness of the SiteWise Monitor service.
- **Console canary testing** — Implemented automated synthetic canary testing to improve pre-release quality assurance.

### Amazon — Software Development Engineer, Compliance Technologies

**Seattle, WA | Jul 2015 – Jul 2019**

- Developed and launched a highly secure case management and investigation platform using Ruby on Rails and Java Spring to manage internal investigations into suspicious customer activity (money laundering, identity theft).
- Ensured platform security through end-to-end encryption, strong authentication and authorization with granular access controls, full audit logging, and secure artifact storage.
- Led the design and development of the system for submitting Suspicious Transaction Reports (STR/SAR) to the Luxembourg Financial Intelligence Unit (FIU) and the UK National Crime Agency (NCA) — a hard regulatory requirement for Amazon to operate payments in those markets.

**Key projects:**

- **Noir Case Management System** — Built the internal investigation platform handling sensitive compliance cases.

### Amazon — Software Development Engineer Intern

**Seattle, WA | May 2014 – Aug 2014**

- Set up a system to integrate Kindle Unlimited books into Goodreads.

### BlackBerry — Software Development Engineer Intern

**Sunrise, FL | Jan 2013 – Aug 2013**

- Collaborated on developing and maintaining software applications for BlackBerry handhelds.
- Contributed to multiple software releases by identifying and resolving issues before they reached users.
- Conducted smoke, regression, GUI, and functional tests on mobile device hardware.

## Personal Projects — Agentic Experiences

Building AI agents is Lucas's main hobby. He runs a personal multi-agent platform in production, end to end:

- **Multi-agent monorepo (Google ADK + AG-UI)** — Seven Python agents (travel planning, grocery/meal planning, Strava-backed fitness coaching, a wellness orchestrator, declarative A2UI surfaces, an oral-board practice agent, and this resume agent) behind a single FastAPI gateway deployed on Railway.
- **Full-stack agent UX** — Next.js + CopilotKit web console and an Expo (iOS/Android) app speaking the AG-UI protocol, with token-level streaming and shared agent state driving generative UI instead of plain chat.
- **Real-world tool use via MCP** — Agents call live MCP servers (Kroger for groceries, Strava for training data, travel search) so they act on real data, not demos.
- **Cross-agent orchestration** — The wellness agent composes the grocery and fitness agents in-process as ADK tools, an architecture he later applied to conversational shopping at DoorDash: the grocery agent was the prototype that shaped his vision for Ask DoorDash.
- **You're experiencing one right now** — this resume Q&A is itself one of his agents.

## Education

### University of Florida — B.S., Computer Engineering (Hardware, CEE)

**Gainesville, FL | Sept 2010 – May 2015**

- GPA: 3.33 | Graduated Cum Laude

## Skills

**Technologies:** React, Redux, HTML5/CSS, AWS Services (DynamoDB, API Gateway, CDK, Synthetics), Java Spring, Ruby on Rails, Git, AI agents (Google ADK, MCP, AG-UI, CopilotKit), LLM-powered product features, system performance & scalability

**Programming Languages:** Java, JavaScript, TypeScript, Golang, Ruby, Python, SQL

## About Lucas

- Lives in Seattle, Washington.
- Passionate about learning, growing, and creative problem-solving — which led him to engineering.
- Enjoys the outdoors: camping and climbing mountains in the Cascade Range; also runs and lifts regularly.
- Has held a wide range of jobs and worked hard to put himself through school.
- Has been a technical leader and go-to expert on his teams — most recently envisioning Ask DoorDash, leading the team to release it, and shipping DashMart personalization and fulfillment improvements — and is currently looking for senior/staff software engineer roles.
- Builds agentic experiences as his main hobby — a production multi-agent platform with web and mobile frontends (see Personal Projects) — and it's where his product ideas start: the hobby grocery agent became the vision for Ask DoorDash and maps closely to his DashMart grocery/convenience experience.
- Values open feedback, willingness to apologize, and the ability to recognize when someone else has a better idea.
