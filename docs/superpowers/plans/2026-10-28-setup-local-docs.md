<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

# SETUP_LOCAL.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay `SETUP_WINDOWS.md` bằng `SETUP_LOCAL.md` (WSL2/Linux là luồng chính,
PowerShell là luồng thay thế) và dọn `.env` gốc.

**Architecture:** Chỉ đổi tài liệu và file env cục bộ. Không sửa
`docker-compose.yml` hay script trong `docker/`.

**Tech Stack:** Docker Compose, bash, PowerShell, Markdown.

**Spec:** `docs/superpowers/specs/2026-10-28-setup-local-docs-design.md`

## Global Constraints

- Không ghi đường dẫn riêng của bất kỳ máy nào (không `D:\`, không tên user).
- Remote clone: `git@github.com:r2d-ai/superset.git`.
- Compose >= 2.24.0; Python 3.11+; Node `^24.16.0`; npm `^11.13.0`.
- Giữ ASF license header ở đầu `SETUP_LOCAL.md`.
- Tài liệu viết tiếng Việt; lệnh bash trước, khối PowerShell ngay dưới khi khác.
- Không sửa `docker-compose.yml`, `docker/*.sh`, `docker/.env`.

---

### Task 1: Dọn `.env` gốc

**Files:**
- Modify: `.env` (gitignored)
- Create: `docker/.env-local` (gitignored)

- [ ] **Step 1:** Ghi `.env` gốc đúng nội dung:

```dotenv
# Docker Compose host port overrides.
# This file is used ONLY for Compose variable interpolation (${...}) in
# docker-compose.yml. It is never copied into the images nor passed into
# containers, so container-internal values (e.g. DATABASE_PORT=5432 inside
# the db container) stay untouched.
COMPOSE_PROJECT_NAME=superset
NGINX_PORT=80
SUPERSET_PORT=8088
NODE_PORT=9000
WEBSOCKET_PORT=8080
DATABASE_PORT=5434
REDIS_PORT=6379
```

- [ ] **Step 2:** Tạo `docker/.env-local`:

```dotenv
# Container-side overrides (loaded via env_file). Never put host ports here.
SUPERSET_LOG_LEVEL=INFO
SUPERSET_DEBUG_ENABLED=false
```

- [ ] **Step 3: Verify**

Run: `docker compose config -q` → exit 0, không in gì.
Run: `docker compose config --format json` rồi kiểm tra service `superset`:
`DATABASE_PORT=5432`, `REDIS_PORT=6379`, `SUPERSET_LOG_LEVEL=INFO`,
`SUPERSET_DEBUG_ENABLED=false`.
Run: `git status --short .env docker/.env-local` → không in gì (cả hai gitignored).

Không có commit (file gitignored).

### Task 2: Viết `SETUP_LOCAL.md`

**Files:**
- Rename: `SETUP_WINDOWS.md` → `SETUP_LOCAL.md` (`git mv`)
- Modify: `SETUP_LOCAL.md` (viết lại toàn bộ)

- [ ] **Step 1:** `git mv SETUP_WINDOWS.md SETUP_LOCAL.md`

- [ ] **Step 2:** Viết lại nội dung theo đúng 11 mục của spec (mục "Thay đổi → 2").
Dữ kiện bắt buộc có trong từng mục (lấy từ file nguồn, không bịa):

1. Chọn môi trường: bảng WSL2 (khuyên dùng trên Windows) / Linux native /
   Windows PowerShell (chậm hơn do filesystem bridge: `uv pip install -e .` và
   `npm ci` chậm, file watch kém).
2. Yêu cầu: bảng phiên bản ở Global Constraints. WSL2: Docker Desktop →
   Settings → Resources → WSL integration bật cho distro. Linux:
   `sudo usermod -aG docker $USER` rồi đăng nhập lại. Kiểm tra
   `docker --version`, `docker compose version`.
3. Clone: `git clone git@github.com:r2d-ai/superset.git ~/superset && cd ~/superset`.
   PowerShell: clone vào thư mục bất kỳ trên Windows; cảnh báo không chạy
   song song từ cả WSL và PowerShell trên cùng repo (hai project Compose khác nhau
   chung tên container).
4. Cấu hình: nội dung `.env` gốc như Task 1 Step 1; liệt kê biến build tùy chọn
   `SUPERSET_BUILD_TARGET` (`dev` mặc định / `lean` / `superset`),
   `INCLUDE_CHROMIUM`, `BUILD_TRANSLATIONS`, `SUPERSET_FORCE_LOAD_EXAMPLES`.
   `docker/.env-local`: biến container `SUPERSET_LOG_LEVEL`,
   `SUPERSET_DEBUG_ENABLED` (bật Werkzeug debugger), `FLASK_DEBUG`
   (`false` = CSP giống production), `ADMIN_PASSWORD`, `SUPERSET_SECRET_KEY`
   (`openssl rand -base64 42`). Cảnh báo không copy `.env-local.example` vì nó
   chứa cổng instance thứ 2.
5. Khởi động: kiểm tra cổng — bash
   `for p in 80 8088 9000 8080 5432 6379; do ss -ltn "sport = :$p" | grep -q LISTEN && echo "$p IN USE" || echo "$p FREE"; done`;
   PowerShell giữ vòng `Test-NetConnection` cũ. Rồi `docker compose config -q`,
   `docker compose config --services` (9 service), `docker compose up -d`,
   `docker compose logs -f superset-init` (4 bước, `load_examples` ~3–4 phút,
   lần sau tự skip), `curl -f http://localhost:8088/health` → `OK`,
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/static/assets/manifest.json` → `200`
   (PowerShell: `curl.exe`, `-o NUL`). Ghi chú: sau restart máy/Docker chạy
   `docker compose up -d` vì `superset-node`, `superset-websocket` không có
   restart policy.
6. Cổng host vs container: giữ nguyên nội dung mục 3 cũ.
7. Chạy không Docker: chỉ Linux/WSL2 — `make venv`, `make install`, hoặc
   `uv pip install -r requirements/development.txt && uv pip install -e .`;
   frontend `cd superset-frontend && npm ci && npm run dev`. Windows native fail
   (`databend-driver` không có wheel `win_amd64`).
8. Truy cập: bảng URL cũ (80, 8088, 9000, `/swagger/v1`); `admin`/`admin`,
   `admin@superset.com`; lệnh login API viết bằng `curl` + khối PowerShell cũ.
9. Lệnh quản lý: giữ bảng lệnh cũ, thêm `docker compose up -d` sau restart.
   Cảnh báo `down -v` xóa `db_home`, `superset_home`, `redis`, `superset_data`.
   Vòng đời: backend `flask run --reload`; worker/beat không reinstall app;
   frontend hot-reload tại :9000; `node_modules` là volume ẩn danh (không thấy
   trên host, xóa bằng `docker compose down -v` hoặc recreate container);
   `local_extensions/` được mount vào `/app/local_extensions`; migration
   `docker compose exec superset superset db upgrade`; đổi env cần `up -d`.
10. Xử lý sự cố — chung: init exit 1 (cổng nội bộ); `env_file`/`required`
    (Compose cũ); `Exited (255)` sau restart Docker → `docker compose up -d`;
    `unhealthy` vài phút do reinstall editable; cảnh báo uv
    `Failed to hardlink files` vô hại; frontend trắng trang → log
    `superset-node`, manifest; build lỗi → `docker compose build --no-cache superset`.
    WSL2/Linux: `sysctl fs.inotify.max_user_watches` (tăng lên `524288` qua
    `/etc/sysctl.conf`); file root-owned → `sudo chown -R $USER: .`.
    Windows: `netsh interface ipv4 show excludedportrange protocol=tcp`.
11. Bảng file cấu hình: `.env` gốc, `docker/.env`, `docker/.env-local`,
    `docker/.env-local.example`, `docker/pythonpath_dev/superset_config.py`,
    `.flaskenv`; cảnh báo `SUPERSET_SECRET_KEY=TEST_NON_DEV_SECRET`.

- [ ] **Step 3: Verify**

Run: `git grep -n -E "D:\\\\|anhnq|nguyenad1905" -- SETUP_LOCAL.md` → không có kết quả.
Run: `git grep -l SETUP_WINDOWS -- ':!docs/superpowers'` → không có kết quả.
Đối chiếu từng tên biến/lệnh trong doc với `docker-compose.yml`, `docker/.env`,
`docker/docker-init.sh`, `docker/docker-bootstrap.sh`.

- [ ] **Step 4: Commit**

```bash
git commit --only -m "docs: replace SETUP_WINDOWS.md with WSL2/Linux-first SETUP_LOCAL.md" -- SETUP_WINDOWS.md SETUP_LOCAL.md
```

### Task 3: Kiểm chứng stack theo doc

- [ ] **Step 1:** `docker compose up -d`
- [ ] **Step 2:** `docker compose ps -a` → 9 service; `superset-init` `Exited (0)`,
  còn lại `Up` (`superset` có thể `unhealthy` vài phút).
- [ ] **Step 3:** health `OK` và manifest `200` (lệnh ở Task 2 mục 5).
- [ ] **Step 4:** Nếu bước nào lệch với doc, sửa doc và amend commit Task 2.
