# DentaFlow — Project Overview

**Purpose:** Intelligent management dashboard for dental clinics, built on top of the 1Denta CRM system (via SQNS CRM Exchange API v2). Enhances 1Denta with AI-powered analytics, unified communications, and CRM pipeline management.

**Target:** Single dental clinic with up to 10 staff members.

**Architecture:** Full-stack containerized (Docker Compose) monorepo with:
- **Backend:** Python 3.11 + FastAPI (async) + SQLAlchemy 2.0 + PostgreSQL 15 + Redis 7 + Celery
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + Zustand + TanStack Query
- **Infrastructure:** Docker Compose (dev & prod), NGINX reverse proxy, Timeweb Cloud VPS (Ubuntu 22.04)

**Key Modules:**
1. Executive Dashboard — AI analytics, patient funnel, doctor workload, admin ratings, Telegram daily reports
2. Unified Communications + CRM Pipeline — single inbox (Telegram, Max/VK, Novofon telephony, website), Kanban pipeline, 360° patient card, WebSocket real-time events

**External Integrations:** 1Denta/SQNS CRM API, Novofon telephony, Telegram Bot (aiogram), Max/VK messaging, OpenAI API

**Language:** UI and comments are in Russian.