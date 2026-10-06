# NovaCart AI Customer Support Platform

> A production-grade, end-to-end AI customer support chatbot built with local Retrieval-Augmented Generation (RAG), strict anti-hallucination guardrails, human agent escalation, multi-role ticket management, and observability dashboards. Zero paid AI APIs required.

---

## Table of Contents

- [Key Architecture & Capabilities](#key-architecture--capabilities)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Default Demo Accounts](#default-demo-accounts)
- [RAG Pipeline & Anti-Hallucination Design](#rag-pipeline--anti-hallucination-design)
- [Human Escalation Workflow](#human-escalation-workflow)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [License](#license)

---

## Key Architecture & Capabilities

1. **Zero Paid AI APIs**:
   - Integrates natively with local **Ollama** (`qwen3:4b` LLM and `nomic-embed-text` embeddings).
   - Features a resilient, high-performance offline fallback vectorizer and extractor so the entire stack works immediately out-of-the-box in testing and local environments.
2. **Grounded RAG (Retrieval-Augmented Generation)**:
   - Paragraph-aware semantic chunking with configurable overlap.
   - Vector search with cosine similarity scoring.
   - Dynamic thresholding: queries are classified as `SUPPORTED`, `PARTIALLY_SUPPORTED`, `UNSUPPORTED`, or `AMBIGUOUS`.
   - Never answers out-of-domain queries without citations; offers automated ticket escalation for unsupported questions.
3. **Multi-Role Authentication & RBAC**:
   - JWT tokens with 12-round bcrypt password hashing.
   - Strict role-based middleware for `CUSTOMER`, `SUPPORT_AGENT`, and `ADMIN`.
4. **Human Escalation & Ticket Management**:
   - Customers can escalate conversations into structured tickets (`TKT-0001`) with a single click.
   - Support Agent Queue with filters (Status, Priority, Agent assignment, Search).
   - Full support for threaded public replies and **private internal notes** (hidden from customers).
   - Agents can inspect the customer's original AI chat history and the exact retrieved chunks that triggered the escalation.
5. **Admin Operations & Observability**:
   - Real-time KPI metrics (total users, conversations, tickets, grounding rate, avg latency).
   - Knowledge Base Document Management: upload `.txt`, `.md`, `.pdf`, `.json`, inspect chunk counts, re-index, or delete.
   - User RBAC management.
   - Full RAG query observability log table.

---

## Tech Stack

- **Backend**: Node.js 22 (ES Modules), Express 4, `@libsql/client` (SQLite with WAL mode and foreign keys), Winston structured logging, Zod validation, Helmet, express-rate-limit.
- **AI & Vector DB**: Ollama (`qwen3:4b` + `nomic-embed-text`), ChromaDB (with automatic embedded cosine fallback).
- **Frontend**: React 18, Vite 5, Tailwind CSS 3, Axios, React Router 6, TanStack Query.
- **Testing**: Jest 29, Supertest 7 (20 unit and integration tests).

---

## Quick Start

### 1. Install Dependencies
```bash
# Install root, server, and client dependencies
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (or use the pre-configured `.env`):
```bash
cp .env.example .env
```

### 3. Seed the Database & Knowledge Base
Loads sample policies (shipping, returns, warranty, security, FAQs) and default accounts:
```bash
npm run seed
```

### 4. Run the Development Servers
Starts both Express API (Port 5000) and React UI (Port 5173):
```bash
npm run dev
```

Visit the application at [http://localhost:5173](http://localhost:5173).

---

## Default Demo Accounts

The login page includes a **one-click credential switcher** for quick testing across all three user roles:

| Role | Email | Password | Primary Interface |
|---|---|---|---|
| **Customer** | `customer@novacart.com` | `CustomerPass123!` | `/chat` — Assistant Chat & Escalation |
| **Support Agent** | `agent@novacart.com` | `AgentPass123!` | `/agent` — Support Queue & Ticket Replies |
| **Admin** | `admin@novacart.com` | `AdminPass123!` | `/admin` — System Metrics, Ingestion, RAG Logs |

---

## RAG Pipeline & Anti-Hallucination Design

```
Customer Message
      │
      ▼
1. Query Classifier (intent & category detection)
      │
      ▼
2. Vector Embedding (Ollama nomic-embed-text / local 768-dim vectorizer)
      │
      ▼
3. Vector Retrieval (ChromaDB top-K cosine search)
      │
      ▼
4. Confidence Evaluation:
      ├─ Score >= 0.70 ──► SUPPORTED ──► Grounded LLM Prompt with Citations
      ├─ 0.60 - 0.70   ──► PARTIALLY_SUPPORTED ──► Grounded Response + Escalation Prompt
      └─ Score < 0.60  ──► UNSUPPORTED ──► Refuse speculation & offer Ticket Creation
      │
      ▼
5. RAG Observability Logging (stored in rag_logs for admin auditing)
```

---

## API Reference

### Authentication
- `POST /api/auth/register` — Create customer account
- `POST /api/auth/login` — Sign in and receive JWT token
- `GET /api/auth/me` — Get authenticated user profile

### Conversations & Assistant Chat
- `GET /api/conversations` — List current user's conversations
- `POST /api/conversations` — Create a new conversation
- `GET /api/conversations/:id` — Get conversation message history
- `POST /api/conversations/:id/messages` — Send message and trigger RAG pipeline
- `POST /api/conversations/:id/escalate` — Escalate conversation to human support ticket

### Tickets & Support Queue
- `GET /api/tickets` — List customer's tickets
- `POST /api/tickets` — Create a new ticket
- `GET /api/tickets/:id` — Get ticket details and messages
- `POST /api/tickets/:id/messages` — Customer reply to ticket
- `GET /api/agent/tickets` — Agent ticket queue with filters (Agent/Admin)
- `PATCH /api/agent/tickets/:id` — Update ticket status/priority/assigned agent (Agent/Admin)
- `POST /api/agent/tickets/:id/messages` — Agent public reply or private internal note (Agent/Admin)

### Knowledge Base & Ingestion (Admin)
- `GET /api/knowledge/documents` — List all ingested documents
- `POST /api/knowledge/documents` — Upload `.txt`, `.md`, `.pdf`, `.json` and ingest
- `POST /api/knowledge/documents/:id/reindex` — Re-process and re-embed document
- `DELETE /api/knowledge/documents/:id` — Remove document and delete chunks from vector store

### System Administration & Observability (Admin)
- `GET /api/admin/stats` — Overall KPI metrics & RAG performance
- `GET /api/admin/users` — User list and role management
- `PATCH /api/admin/users/:id` — Change role or activate/disable user
- `GET /api/admin/rag-logs` — Full query observability table

---

## Testing

Run the automated test suite (all 20 unit and integration tests):
```bash
npm test
```

Unit tests cover:
- Text extraction and cleaning
- Semantic token-aware chunking with overlap
- Confidence evaluator thresholding
- Strict anti-hallucination prompt construction
- End-to-end integration API testing (auth, conversations, RAG citations, ticket escalation)
