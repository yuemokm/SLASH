# Slash

**English** | [简体中文](README.zh-CN.md)

A local desktop AI workspace for product managers. Turn research and existing materials into interactive HTML prototypes, product requirements documents (PRDs), and revision deliverables through conversation.

Built with Electron, React, TypeScript, and the Pi agent runtime. The current package version is **0.3.12**. Development and desktop workflows target **Windows**; other platforms are not verified.

## What you can do

- Research across authorized folders and reference source material in conversations.
- Create and revise HTML prototypes, PRDs, Markdown documents, and diagrams.
- Preview outputs, review drafts, and save changes with version and conflict checks.
- Extract text from supported Word, Excel, and text-based PDF files, with source and coverage information.
- Connect external tools through MCP and supported document CLIs; share folders through Windows SMB.

Editing starts in conversation. Resource and output views help you browse, preview, reference, and locate files. Cloud model calls and external integrations require your own configuration.

## Quick start

### Requirements

- Windows
- Node.js 24 and npm
- Git, to clone this repository
- A configured model endpoint and API key for AI tasks

```powershell
git clone https://github.com/yuemokm/SLASH.git
cd SLASH
npm ci
npm run dev
```

After installing dependencies, you can also double-click [`双击启动开发环境.bat`](双击启动开发环境.bat).

The development command compiles the Electron main process and preload, starts Vite, and launches the desktop app. Renderer changes reload automatically; restart the development app after main-process or preload changes.

### First use

1. Select a workspace and create or open a project in Settings.
2. Configure your model endpoint, exact model ID, and API key; test the connection.
3. Add reference materials or authorize additional folders.
4. Describe a task in conversation, review the resulting draft, and save it to the project.
5. Preview a deliverable and reference it in conversation for further changes.

Reference originals are protected; processing uses separate copies. Model credentials are encrypted locally for the current Windows user. Local application storage defaults to `%APPDATA%\slash`.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the lockfile |
| `npm run dev` | Start the desktop development environment |
| `npm run dev:renderer` | Start only Vite; Electron capabilities are unavailable |
| `npm run check` | Check renderer and main-process TypeScript |
| `npm test` | Run the automated test suite |
| `npm run build` | Build the renderer and compile the main process |
| `npm run start` | Build and launch Electron from local production files |
| `npm run pack` | Build a Windows portable package in `release/` |

Packaging is a separate, explicit operation, not a required development step. Live model checks consume API quota. Local deterministic tests do not establish cloud model quality or external service compatibility.

## Repository layout

```text
main/          Electron host, agent runtime, storage, and tool gateway
shared/        Shared contracts and types
src/           React renderer
public/        Bundled static assets
scripts/       Development, verification, and maintenance scripts
tests/         Automated tests
docs/          Specifications, architecture, and verification records
exa-results/   Research supporting product decisions
knowledge-web/ Historical knowledge publishing source and compatibility contracts
```

The renderer does not access files, SQL, or the shell directly. Agent tools go through the host gateway. Changes to multiple resources use version checks and resource locks; conflicting files must not be silently overwritten.

## Integrations and current limits

- **Models:** configure a supported provider or compatible endpoint. Available capabilities depend on the model and provider.
- **Documents:** Feishu and DingTalk integrations require the corresponding CLI and account setup. Consult the relevant verification record before relying on a publishing workflow.
- **MCP:** configure a server and inspect its tools before publishing. An external write timeout can leave an unknown result; inspect the destination before retrying.
- **Sharing:** Windows SMB requires appropriate permissions and credentials. Two-machine access, drive visibility in a standard user's Explorer, restart recovery, and permission revocation still require real-device acceptance.
- **Parsing:** text-based PDF extraction does not include scanned-page OCR. Word export and draw.io previews support limited subsets.
- **Prototypes:** HTML export preserves project files and relative dependencies; it does not build arbitrary frameworks. Interaction checks do not validate a backend or all business rules.

## Documentation

Most detailed engineering documents are currently in Chinese.

- [Documentation index](docs/README.md)
- [Current scope and acceptance plan](docs/pm-focus-delivery-plan.md)
- [Product specification](docs/product-spec.md)
- [Development handoff and verification records](docs/development-handoff.md)
- [Architecture baseline](docs/architecture-baseline.md)
- [SMB sharing design and acceptance](docs/sharing-network-drive.md)
- [Detailed usage and historical README](docs/usage-and-history.zh-CN.md)

Read [`AGENTS.md`](AGENTS.md) before changing the project. Product behavior changes require corresponding documentation and diagram updates. Report passed checks, failures, and unverified integrations separately.

## Repository hygiene

[`.gitignore`](.gitignore) excludes dependencies, builds, test data, local backups, environment files, and generated presentation captures. Keep credentials and personal workspace data outside tracked files. Commit `package-lock.json` alongside dependency changes.

Local presentation materials, historical deliverables, UI references, backups, and loose test evidence are organized under `过程文件/` and excluded from the repository. New publication and delivery test evidence also goes to `过程文件/测试记录/`. Existing `.test-data/` inputs keep their established paths. Engineering documents, research conclusions, development scripts, tests, and historical compatibility source remain tracked. Manual SFA replays require the archived local materials; normal development and automated tests do not depend on the media. See the [workspace organization record](docs/workspace-organization-2026-10-13.md) for current paths and the [repository cleanup record](docs/repository-hygiene-2026-10-12.md) for tracking history.

No project license has been added. Third-party components and assets retain their respective licenses.
