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

# Hướng dẫn setup môi trường phát triển local

Hướng dẫn chạy Apache Superset ở chế độ phát triển bằng Docker Compose, dựa trên
`docker-compose.yml` và các script trong `docker/` của repo.

- **Luồng chính:** WSL2 (trên Windows) hoặc Linux native, lệnh viết bằng bash.
- **Luồng thay thế:** Windows PowerShell. Chỗ nào lệnh khác, khối PowerShell
  được ghi ngay bên dưới khối bash.

Thành phần của stack:

- Backend: Flask / Python (thư mục `superset/`)
- Frontend: React / TypeScript (thư mục `superset-frontend/`)
- Metadata store: PostgreSQL
- Cache / broker: Redis

---

## 1. Chọn môi trường

| Môi trường | Khi nào dùng | Ghi chú |
|---|---|---|
| **WSL2** | **Khuyên dùng trên Windows** | Repo nằm trong filesystem Linux của WSL2 (ví dụ `~/superset`), Docker Desktop bật WSL integration |
| Linux native | Máy Linux | Docker Engine + Compose plugin |
| Windows PowerShell | Khi không dùng được WSL2 | Chậm hơn do filesystem bridge: `uv pip install -e .` và `npm ci` chậm, file watch kém |

Stack dev bind-mount mã nguồn vào container (`./superset`, `./superset-frontend`,
`./docker`...). Khi repo nằm trên filesystem Windows, Docker Desktop phải đọc file
qua filesystem bridge nên mọi thao tác I/O trong container đều chậm, và webpack
có thể không rebuild khi sửa file.

---

## 2. Yêu cầu hệ thống

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Docker Engine / Docker Desktop | bản mới | Bắt buộc |
| Docker Compose plugin | **>= 2.24.0** | Bắt buộc — xem ghi chú bên dưới |
| Git | bất kỳ | Bắt buộc |
| Python | 3.11+ | Chỉ cần khi chạy không Docker (mục 7); `make venv` chỉ nhận `python3.11` / `python3.12` |
| Node.js / npm | `^24.16.0` / `^11.13.0` | Chỉ cần khi chạy không Docker (mục 7) |

> **Vì sao cần Compose >= 2.24.0:** `docker-compose.yml` khai báo `env_file` theo
> dạng dài (`- path: ..., required: true|false`) cho mọi service. Cú pháp `required`
> chỉ được hỗ trợ từ Compose 2.24.0. Bản cũ sẽ báo lỗi kiểu
> `env_file must be a mapping` hoặc `additional properties are not allowed`
> (`required`), dễ bị hiểu nhầm là sai cấu hình. Nếu gặp lỗi này, nâng Docker
> thay vì sửa YAML.

Thiết lập theo môi trường:

- **WSL2:** Docker Desktop → Settings → Resources → WSL integration → bật cho
  distro đang dùng.
- **Linux:** thêm user vào group `docker` rồi đăng xuất/đăng nhập lại:

  ```bash
  sudo usermod -aG docker $USER
  ```

Kiểm tra nhanh (cả hai lệnh phải exit 0):

```bash
docker --version
docker compose version
```

---

## 3. Clone repo

WSL2 / Linux — clone vào filesystem Linux:

```bash
git clone git@github.com:r2d-ai/superset.git ~/superset && cd ~/superset
```

PowerShell — clone vào thư mục bất kỳ trên Windows rồi `cd` vào đó:

```powershell
git clone git@github.com:r2d-ai/superset.git
cd superset
```

> **Chỉ chạy stack từ một nơi.** Nếu có một bản clone trong WSL và một bản trên
> Windows với cùng `COMPOSE_PROJECT_NAME=superset`, cả hai là **cùng một** project
> Compose (dùng chung container và volume). `docker compose up -d` từ bản clone
> kia sẽ recreate container với bind mount trỏ sang cây mã nguồn của bản đó.
> Không chạy luân phiên/song song từ WSL và PowerShell.

---

## 4. Cấu hình

Có hai file cấu hình local, cả hai đều gitignored. Vai trò của chúng khác nhau —
xem mục 6.

### 4.1. `.env` ở thư mục gốc — cổng host và biến build

File này chỉ dùng cho Compose interpolation (`${...}`) trong `docker-compose.yml`,
không được đưa vào container. Tạo `.env` ở thư mục gốc repo:

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

`DATABASE_PORT=5434` tránh xung đột với PostgreSQL cài sẵn trên máy (cổng `5432`).
Nếu cổng `5432` trên host đang trống, có thể để `5432`.

Biến build tùy chọn (cũng đặt trong `.env` gốc nếu cần):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `SUPERSET_BUILD_TARGET` | `dev` | Target build image: `dev` (live-reload), `lean` (tối giản), `superset` (đầy đủ) |
| `INCLUDE_CHROMIUM` | `false` | `true` cài Playwright + Chromium headless vào image (cho Alerts & Reports, thumbnail); target `superset` đã có sẵn |
| `BUILD_TRANSLATIONS` | `false` | Build bản dịch khi build image |
| `SUPERSET_FORCE_LOAD_EXAMPLES` | (rỗng) | Đặt `yes` để `superset-init` nạp lại examples dù đã có |

`SUPERSET_BUILD_TARGET`, `INCLUDE_CHROMIUM`, `BUILD_TRANSLATIONS` là build arg —
`docker compose up -d` không build lại image đã có. Đổi biến build cần build lại:
`docker compose up -d --build`.

### 4.2. `docker/.env-local` — override cho container

File này nằm trong `env_file` của hầu hết service (trừ `redis`,
`superset-websocket`), nên mọi biến trong đó được đưa
vào container và ghi đè `docker/.env`. Chỉ đặt biến **an toàn trong container**:

| Biến | Ý nghĩa |
|---|---|
| `SUPERSET_LOG_LEVEL` | Mức log của Superset (`debug`, `info`, `warning`...) |
| `SUPERSET_DEBUG_ENABLED` | `true` bật Werkzeug debugger (`/console`, cần PIN) |
| `FLASK_DEBUG` | `false` để chạy CSP và xử lý lỗi giống production |
| `ADMIN_PASSWORD` | Mật khẩu user `admin` do `superset-init` tạo (mặc định `admin`) |
| `SUPERSET_SECRET_KEY` | Khóa bí mật riêng thay cho giá trị mặc định công khai |

Ví dụ `docker/.env-local`:

```dotenv
# Container-side overrides (loaded via env_file). Never put host ports here.
SUPERSET_LOG_LEVEL=INFO
SUPERSET_DEBUG_ENABLED=false
```

Sinh `SUPERSET_SECRET_KEY` (chỉ làm trước lần khởi động đầu tiên; đổi key trên
volume đang dùng sẽ không giải mã được dữ liệu đã mã hóa, ví dụ mật khẩu
database connection):

```bash
echo "SUPERSET_SECRET_KEY=$(openssl rand -base64 42)" >> docker/.env-local
```

```powershell
# cần openssl.exe trong PATH (ví dụ thêm thư mục usr\bin của Git for Windows vào PATH); trong Git Bash dùng lệnh bash ở trên
"SUPERSET_SECRET_KEY=" + (openssl rand -base64 42) | Add-Content docker/.env-local
```

> ⚠️ **Không copy `docker/.env-local.example` sang `docker/.env-local`.** File mẫu
> đó chứa cổng của "instance thứ 2" (`DATABASE_PORT=5433`, `REDIS_PORT=6380`,
> `SUPERSET_PORT=8089`...). Các giá trị này ghi đè `docker/.env` bên trong
> container và làm hỏng kết nối nội bộ (xem mục 6). Không đặt `NGINX_PORT`,
> `SUPERSET_PORT`, `NODE_PORT`, `WEBSOCKET_PORT`, `DATABASE_PORT`, `REDIS_PORT`
> vào `docker/.env-local`.

---

## 5. Khởi động, chờ sẵn sàng, kiểm tra

### 5.1. Kiểm tra cổng trống

Cổng mặc định: `80` (nginx), `8088` (superset), `9000` (webpack dev server),
`8080` (websocket), `5432` (postgres), `6379` (redis). Nếu đã đổi cổng trong
`.env` gốc thì kiểm tra cổng mới.

```bash
for p in 80 8088 9000 8080 5432 6379; do ss -ltn "sport = :$p" | grep -q LISTEN && echo "$p IN USE" || echo "$p FREE"; done
```

Trên WSL2, `ss` không thấy cổng do tiến trình Windows chiếm — chạy thêm khối
PowerShell bên dưới trên Windows.

```powershell
foreach ($p in @(80,8088,9000,8080,5432,6379)) {
  $inUse = Test-NetConnection -ComputerName localhost -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue
  Write-Host "Port $p : $(if($inUse){'IN USE'}else{'FREE'})"
}
```

Nếu một cổng bị chiếm, đổi giá trị tương ứng trong `.env` gốc (mục 4.1).

### 5.2. Kiểm tra cấu hình Compose

Bước này bắt lỗi cú pháp/env nhanh hơn nhiều so với đợi build xong mới lỗi:

```bash
docker compose config -q
docker compose config --services
```

Lệnh đầu phải exit 0 và không in gì. Lệnh sau phải liệt kê 9 service: `db`,
`redis`, `superset-init`, `superset`, `superset-worker`, `superset-worker-beat`,
`nginx`, `superset-node`, `superset-websocket` (thứ tự có thể khác;
`superset-tests-worker` thuộc profile `optional` nên không hiện).

### 5.3. Khởi động

```bash
docker compose up -d
```

Lần chạy đầu cần build image, có thể mất 10–30 phút. Các lần sau dùng lại cache.

### 5.4. Chờ cho tới khi thật sự sẵn sàng

**Container `Up` KHÔNG có nghĩa là app đã dùng được.** Chuỗi khởi động:

1. `superset-init` chạy 4 bước: `db upgrade` → tạo admin → `superset init` →
   `load_examples`. Bước `load_examples` chậm nhất (~3–4 phút). Các lần sau
   script kiểm tra dữ liệu mẫu đã có và tự bỏ qua.
2. `superset` và `superset-worker` chỉ khởi động **sau khi** `superset-init`
   exit 0 (`depends_on: service_completed_successfully`).
3. `superset-node` chạy `npm ci` rồi khởi động webpack dev server, mất nhiều phút.
4. `nginx` chờ tối đa **~10 phút** cho webpack phục vụ `manifest.json` rồi mới
   khởi động.

Theo dõi init:

```bash
docker compose logs -f superset-init
```

Chờ init kết thúc (`Exited (0)` là bình thường):

```bash
docker compose ps -a superset-init --format "table {{.Service}}\t{{.Status}}"
```

Nếu init fail, xem mục 10.1.

### 5.5. Kiểm tra

```bash
docker compose ps -a --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
curl -f http://localhost:8088/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/static/assets/manifest.json
```

```powershell
docker compose ps -a --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
curl.exe -f http://localhost:8088/health
curl.exe -s -o NUL -w "%{http_code}" http://localhost:9000/static/assets/manifest.json
```

Kết quả mong đợi: `/health` trả `OK`, manifest trả `200`. Nếu fail ngay sau
`up -d`, thường là kiểm tra quá sớm (mục 5.4), không phải cấu hình sai.

### 5.6. Sau khi restart máy hoặc Docker

```bash
docker compose up -d
```

Dùng `up -d`, không dùng `start`. `superset-node` và `superset-websocket` không
khai báo `restart` policy nên không tự lên lại sau khi Docker/WSL tắt; các service
chạy lâu dài còn lại (trừ `superset-init` chạy một lần) có `restart: unless-stopped`.

---

## 6. Cổng host và cổng nội bộ container

Hai nhóm cổng này có ý nghĩa khác nhau và là nguồn gây nhầm lẫn phổ biến nhất:

| Cổng | Nơi khai báo | Ý nghĩa |
|---|---|---|
| Host | `.env` (thư mục gốc) | Chỉ dùng cho Compose interpolation (`${...}`) trong `docker-compose.yml` |
| Nội bộ container | `docker/.env` | Giá trị mà tiến trình trong container thực sự dùng |

Ví dụ `DATABASE_PORT`:

- `.env` (gốc) khai báo `DATABASE_PORT=5434` → ánh xạ host `127.0.0.1:5434` →
  container `5432`.
- `docker/.env` khai báo `DATABASE_PORT=5432` → app trong container kết nối tới
  Postgres ở port `5432` (đúng port Postgres thực sự lắng nghe).

Nếu đặt `DATABASE_PORT=5434` trong `docker/.env` (hoặc `docker/.env-local`) thì app
trong container sẽ tìm Postgres ở port `5434` và báo lỗi:

```
psycopg2.OperationalError: connection to server at "db" (172.x.x.x), port 5434 failed:
Connection refused
```

Tương tự, `REDIS_PORT` trong container phải giữ `6379`.

---

## 7. Chạy không Docker (Python/Node local)

Chỉ áp dụng cho **Linux / WSL2**. Native Windows không cài được dependencies:
`requirements/development.txt` chứa gói chỉ có wheel cho Linux/macOS, ví dụ:

```
databend-driver==0.34.2 has no wheels with a matching platform tag (e.g. `win_amd64`)
```

Backend:

```bash
make venv                  # tạo ./venv bằng python3.11 hoặc python3.12
source venv/bin/activate
make install               # cài deps + tạo admin + db upgrade + init + load examples + npm ci + pre-commit
```

Hoặc chỉ cài dependencies thủ công:

```bash
pip install uv
uv pip install -r requirements/development.txt && uv pip install -e .
```

> `make install` tạo admin với mật khẩu `general` và email `admin@superset.io`
> (khác với tài khoản do Docker tạo ở mục 8).

Frontend:

```bash
cd superset-frontend && npm ci && npm run dev-server
```

`npm run dev-server` chạy webpack dev server tại http://localhost:9000 (giống
`make node-app`); `npm run dev` chỉ build ở chế độ watch, không mở dev server.

---

## 8. Truy cập và tài khoản

| Mục đích | URL |
|---|---|
| Superset (qua nginx) | http://localhost:80 |
| Superset (trực tiếp) | http://localhost:8088 |
| Frontend dev server (webpack) | http://localhost:9000 |
| Swagger UI | http://localhost:8088/swagger/v1 |

Tài khoản admin do `docker/docker-init.sh` tạo:

| Trường | Giá trị |
|---|---|
| Username | `admin` |
| Password | `admin` (hoặc giá trị `ADMIN_PASSWORD`) |
| Email | `admin@superset.com` |

Đổi mật khẩu qua `ADMIN_PASSWORD` trong `docker/.env-local` trước khi khởi động lần đầu.

Kiểm tra đăng nhập qua API:

```bash
curl -s -X POST http://localhost:8088/api/v1/security/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin","provider":"db","refresh":true}'
```

```powershell
$r = Invoke-RestMethod -Uri "http://localhost:8088/api/v1/security/login" `
  -Method Post -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin","provider":"db","refresh":true}'
$r.access_token
```

Kết quả mong đợi: JSON có `access_token`.

---

## 9. Lệnh quản lý và vòng đời phát triển

```bash
docker compose ps                          # trạng thái các container
docker compose logs -f superset            # log backend
docker compose logs -f superset-node       # log webpack dev server
docker compose logs -f superset-init       # log init DB / load examples
docker compose up -d                       # khởi động / khởi động lại sau restart máy (giữ volume)
docker compose down                        # dừng, giữ nguyên volume
docker compose build superset              # build lại image
```

> ### ⚠️ `docker compose down -v` — XÓA DỮ LIỆU
>
> **Không dùng trong quy trình thường ngày.** Cờ `-v` xóa các named volume:
> `db_home` (Postgres — toàn bộ user, database connection, dataset, chart,
> dashboard), `superset_home`, `redis`, `superset_data`, cùng các volume ẩn danh
> (ví dụ `node_modules` của `superset-node`).
>
> Sau đó phải `docker compose up -d` và init lại từ đầu. Chỉ dùng khi cần reset
> sạch một môi trường hỏng **và** đã chấp nhận mất toàn bộ dữ liệu dev. Backup
> volume `db_home` trước nếu còn dữ liệu cần giữ.

### 9.1. Vòng đời phát triển

- **Backend (Python):** code được bind-mount từ host, container `superset` chạy
  `flask run --reload`. Sửa file Python sẽ **tự reload**, **không cần** restart.
  Restart còn chậm hơn: mỗi lần start, `docker-bootstrap.sh` chạy
  `uv pip install -e .` (mất vài phút, xem 10.4).
- **Worker / beat:** `superset-worker` và `superset-worker-beat` không reinstall
  app khi start (chỉ cài `superset-core`). Celery không tự reload — sửa code
  task thì `docker compose restart superset-worker`.
- **Frontend (TypeScript):** webpack dev server hot-reload tại
  http://localhost:9000. Không cần restart.
- **`node_modules`:** là volume ẩn danh của `superset-node` (`/app/superset-frontend/node_modules`),
  không thấy trên host. Muốn cài lại sạch: recreate container
  (`docker compose up -d --force-recreate --renew-anon-volumes superset-node`)
  hoặc `docker compose down -v` (xóa cả dữ liệu, xem cảnh báo trên).
- **`local_extensions/`:** thư mục ở gốc repo được mount vào
  `/app/local_extensions` trong các container Superset.
- **Migration:** khi thay đổi model, chạy
  `docker compose exec superset superset db upgrade`.
- **Đổi env trong `docker/.env`, `docker/.env-local` hoặc biến cổng trong `.env`
  gốc:** `restart` không nạp lại env — phải `docker compose up -d` để recreate
  container. Riêng biến build (`SUPERSET_BUILD_TARGET`, `INCLUDE_CHROMIUM`,
  `BUILD_TRANSLATIONS`) cần `docker compose up -d --build` (mục 4.1).
- **Chế độ `mcp`:** `docker-bootstrap.sh` hỗ trợ tham số `mcp`
  (`superset mcp run`, cổng `MCP_PORT`, mặc định `5008`), nhưng
  `docker-compose.yml` không có service nào chạy chế độ này và không publish
  cổng `5008` ra host.

---

## 10. Xử lý sự cố

### 10.1. `superset-init` báo lỗi và exit 1

Gần như luôn do cổng nội bộ container (mục 6). Kiểm tra:

```bash
docker compose config superset-init | grep -E "DATABASE_PORT|REDIS_PORT"
```

```powershell
docker compose config superset-init | Select-String "DATABASE_PORT|REDIS_PORT"
```

Mọi dòng `DATABASE_PORT` phải là `"5432"` và `REDIS_PORT` phải là `"6379"`. Nếu
khác, kiểm tra `docker/.env-local` (mục 4.2).

### 10.2. `env_file must be a mapping` hoặc lỗi Compose không hiểu `required`

`docker-compose.yml` dùng `env_file` dạng dài có `required`. Cần Compose
**>= 2.24.0**. Nâng Docker rồi chạy lại:

```bash
docker compose version
docker compose config -q
```

Không sửa YAML để "né" lỗi.

### 10.3. `superset-node` / `superset-websocket` `Exited (255)` sau restart Docker

Hai service này không có restart policy nên dừng khi Docker Desktop/WSL tắt và
không tự lên lại. Chạy:

```bash
docker compose up -d
```

### 10.4. Container `superset` báo `unhealthy` lúc khởi động

Container `superset` cài lại package ở chế độ editable (`uv pip install -e .`) mỗi
lần start nên mất vài phút trước khi app sẵn sàng (lâu hơn khi repo nằm trên
filesystem Windows). Healthcheck sẽ trở lại `healthy` sau đó.

Cảnh báo `Failed to hardlink files` của uv trong log là **vô hại** (uv chuyển
sang copy file).

### 10.5. Frontend trắng trang, 404 asset, hoặc webpack chưa sẵn sàng

Xem log `superset-node` — `npm ci` và webpack compile mất nhiều phút:

```bash
docker compose logs -f superset-node
```

Kiểm tra manifest:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/static/assets/manifest.json
```

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:9000/static/assets/manifest.json
```

Trong lúc chờ, truy cập thẳng http://localhost:9000 thay vì qua nginx
(http://localhost:80) — nginx chỉ khởi động **sau khi** manifest sẵn sàng
(tối đa ~10 phút).

### 10.6. `docker compose up` báo lỗi build image

Xóa cache và build lại:

```bash
docker compose build --no-cache superset
```

### 10.7. WSL2 / Linux: lỗi `ENOSPC` hoặc webpack không rebuild khi sửa file

Áp dụng khi gặp `ENOSPC: System limit for number of file watchers reached` hoặc
file watch không hoạt động — thường do hết inotify watcher. Kiểm tra:

```bash
sysctl fs.inotify.max_user_watches
```

Tăng lên `524288` trên máy/distro chạy lệnh:

```bash
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 10.8. WSL2 / Linux: file trong repo thuộc `root`

Các container Superset chạy với user `root` trên bind mount, nên file sinh ra
trong repo có thể thuộc `root`. Lấy lại quyền (chạy ở thư mục gốc repo):

```bash
sudo chown -R $USER: .
```

### 10.9. Windows: `ports are not available: ... bind: An attempt was made to access a socket in a way forbidden by its access permissions`

Windows reserve một số dải cổng cho Hyper-V/WSL. Xem dải bị reserve:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Chọn cổng nằm ngoài các dải này và cập nhật trong `.env` gốc.

### 10.10. Reset toàn bộ môi trường

> ⚠️ **Mất toàn bộ dữ liệu dev.** Xem cảnh báo ở mục 9 trước khi chạy.

```bash
docker compose down -v
docker compose up -d
```

Sau khi `down -v`, `superset-init` chạy lại từ đầu và nạp examples trở lại.

---

## 11. File cấu hình trong repo

| File | Vai trò | Có commit? |
|---|---|---|
| `.env` (thư mục gốc) | Cổng host + biến build cho Compose interpolation | Không (`.gitignore`) |
| `docker/.env` | Cấu hình môi trường bên trong container (mặc định) | Có |
| `docker/.env-local` | Override cho container (biến an toàn, mục 4.2) | Không (`.gitignore`) |
| `docker/.env-local.example` | Mẫu cho chạy nhiều instance — **không copy** sang `.env-local` | Có |
| `docker/pythonpath_dev/superset_config.py` | Config Superset dùng trong container | Có |
| `.flaskenv` | `FLASK_APP`, `FLASK_DEBUG` cho Flask CLI | Có |

> ### ⚠️ Về `SUPERSET_SECRET_KEY`
>
> `docker/.env` trong repo để sẵn `SUPERSET_SECRET_KEY=TEST_NON_DEV_SECRET` — một
> giá trị cố định và công khai. **Chỉ dùng cho local dev**, không dùng cấu hình
> này cho host dùng chung hoặc môi trường có dữ liệu thật. Muốn đổi, đặt khóa
> riêng trong `docker/.env-local` (mục 4.2).
