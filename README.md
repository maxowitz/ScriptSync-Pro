# ScriptSync Pro

ScriptSync Pro automatically aligns screenplay dialogue to recorded video takes. Upload a screenplay in Fountain format, point the system at your video clips, and ScriptSync transcribes the audio, matches each line of dialogue to the corresponding take and timecode, and surfaces the results inside Adobe Premiere Pro via a CEP plugin.

## Architecture

```
+---------------------+        +---------------------+
|   Premiere Pro      |        |   Web Portal        |
|   CEP Plugin        |        |   (React + Vite)    |
|   plugin/           |        |   portal/           |
+--------+------------+        +--------+------------+
         |                              |
         |  REST / WebSocket            |  REST / WebSocket
         v                              v
+--------------------------------------------------+
|             Express API Server                   |
|             server/                              |
|   Auth, Projects, Screenplays, Clips, Mappings   |
+--------+----------------+----------+-------------+
         |                |          |
         v                v          v
   +----------+    +----------+   +----------------+
   | Postgres |    |  Redis   |   | Cloudflare R2  |
   | (data)   |    | (queues) |   | (media files)  |
   +----------+    +----------+   +----------------+

+---------------------+
|   Local Helper      |
|   plugin/helper/    |
|   localhost:9876    |
|   FFmpeg + Whisper  |
+---------------------+
```

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Server, portal, plugin |
| FFmpeg | 6+ | Audio extraction, media probing |
| Whisper.cpp | latest | Local speech-to-text transcription |
| Docker & Docker Compose | 24+ | Optional containerized setup |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Job queue (Bull) |

## Quick Start with Docker Compose

```bash
# Clone and enter the project
cd Syncopation

# Create server env file
cp server/.env.example server/.env
# Edit server/.env with your values (see Environment Variables below)

# Start all services
docker compose up -d

# Run database migrations
docker compose exec server npx prisma migrate deploy

# Seed sample data
docker compose exec server node prisma/seed.js

# Portal is available at http://localhost:5173
# API server at http://localhost:3000
```

## Manual Setup

### 1. Database

```bash
# Start Postgres and Redis (or use Docker for just these)
docker compose up -d postgres redis
```

### 2. Server

```bash
cd server
npm install
cp .env.example .env   # then edit with real values
npx prisma migrate dev
npm run db:seed
npm run dev             # starts on port 3000
```

### 3. Portal

```bash
cd portal
npm install
npm run dev             # starts on port 5173
```

### 4. Local Helper (for Whisper + FFmpeg)

```bash
cd plugin/helper
npm install

# Place Whisper model files in the models/ directory
# e.g., models/ggml-base.en.bin

npm run dev             # starts on localhost:9876
```

### 5. Premiere Pro Plugin

Copy the `plugin/` directory into the CEP extensions folder:

- **macOS**: `~/Library/Application Support/Adobe/CEP/extensions/com.scriptsync.pro`
- **Windows**: `%APPDATA%\Adobe\CEP\extensions\com.scriptsync.pro`

Restart Premiere Pro and open the panel from Window > Extensions > ScriptSync Pro.

## Environment Variables

Create `server/.env` with the following:

```
# Database
DATABASE_URL=postgresql://scriptsync:scriptsync_dev@localhost:5432/scriptsync

# Auth
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=scriptsync-media
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Email (optional, for invites)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@scriptsyncpro.com
SMTP_PASS=your-smtp-password

# Anthropic (for Claude-based matching)
ANTHROPIC_API_KEY=sk-ant-...
```

## R2 Bucket Configuration

1. Log into the Cloudflare dashboard.
2. Navigate to R2 > Create Bucket.
3. Name it `scriptsync-media`.
4. Create an API token with read/write access to the bucket.
5. Copy the account ID, access key, and secret key into your `.env` file.
6. Enable public access if you want shareable clip URLs (optional).

## Whisper Binary Setup

ScriptSync uses Whisper.cpp for local transcription.

```bash
# Build Whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make

# Download a model
bash models/download-ggml-model.sh base.en

# Copy binary and model
cp main /usr/local/bin/whisper
mkdir -p /path/to/Syncopation/plugin/helper/models
cp models/ggml-base.en.bin /path/to/Syncopation/plugin/helper/models/
```

Or set environment variables to point to existing installations:

```bash
export WHISPER_PATH=/path/to/whisper
export WHISPER_MODELS_DIR=/path/to/models
export FFMPEG_PATH=/usr/local/bin/ffmpeg
```

## Adding Your First User

Use the seed script for a quick test user:

```bash
cd server
npm run db:seed
# Creates admin@scriptsyncpro.com / password123
```

Or register through the portal at http://localhost:5173/register.

## Inviting Team Members

1. Open a project in the portal.
2. Go to Settings > Members > Invite.
3. Enter the team member's email and select their role (Editor, Uploader, or Viewer).
4. They will receive an email with a link to join.

## Plugin Installation in Premiere Pro

1. Enable unsigned extensions (development mode):
   - **macOS**: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`
   - **Windows**: Set `PlayerDebugMode` to `1` in the registry under `HKCU\Software\Adobe\CSXS.11`
2. Copy the `plugin/` folder to the CEP extensions directory (see Manual Setup above).
3. Restart Premiere Pro.
4. Open Window > Extensions > ScriptSync Pro.
5. Log in with your server URL and credentials.
6. Start the local helper (`plugin/helper`) for transcription features.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register a new user |
| POST | /api/auth/login | Log in, receive tokens |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/projects | List user projects |
| POST | /api/projects | Create a project |
| GET | /api/projects/:id | Get project details |
| POST | /api/projects/:id/members | Invite a member |
| POST | /api/projects/:id/screenplays | Upload a screenplay |
| GET | /api/projects/:id/screenplays | List screenplays |
| POST | /api/projects/:id/clips | Register a clip |
| GET | /api/projects/:id/clips | List clips |
| POST | /api/projects/:id/clips/:clipId/transcribe | Start transcription |
| GET | /api/projects/:id/mappings | Get script-to-clip mappings |
| POST | /api/projects/:id/mappings/auto | Run auto-matching |
| PUT | /api/mappings/:id/approve | Approve a mapping |

## Troubleshooting

**Database connection refused**
Make sure Postgres is running (`docker compose up -d postgres`) and that `DATABASE_URL` in `.env` matches the host and port.

**Prisma migration errors**
Run `npx prisma migrate reset` to start fresh (destroys data). Then re-seed with `npm run db:seed`.

**FFmpeg not found**
Install FFmpeg (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Ubuntu) or set `FFMPEG_PATH` to the full path of the binary.

**Whisper transcription fails**
Verify the binary works standalone: `whisper -m models/ggml-base.en.bin -f test.wav`. Check that the model file exists and is not corrupted.

**Helper not reachable from plugin**
The helper must be running on localhost:9876. Check that no firewall or other process is blocking the port. Confirm with `curl http://localhost:9876/health`.

**Plugin not visible in Premiere Pro**
Ensure debug mode is enabled and the extension is in the correct CEP directory. Check the CSXS version number matches your Premiere Pro version (CSXS.11 for CC 2024+).

**Port conflicts**
If 3000, 5173, 5432, 6379, or 9876 are already in use, update the port numbers in docker-compose.yml, .env, and the helper's HELPER_PORT environment variable.
