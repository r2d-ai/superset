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

# Spec: Hướng dẫn setup local (WSL2/Linux + Windows PowerShell)

## Mục tiêu

Thay `SETUP_WINDOWS.md` bằng `SETUP_LOCAL.md`: một tài liệu chung cho team, đúng
với `docker-compose.yml`, `docker/.env`, `docker/docker-init.sh`,
`docker/docker-bootstrap.sh`, `docker/docker-frontend.sh` hiện tại.

- **Luồng chính:** WSL2 hoặc Linux native (bash), repo trong filesystem Linux
  (ví dụ `~/superset`).
- **Luồng thay thế:** Windows PowerShell, repo trên filesystem Windows (đường
  dẫn tùy máy, không gắn ổ đĩa cụ thể), kèm ghi chú về cái giá hiệu năng.
- `.env` gốc chỉ còn biến thật sự được Compose interpolate.

## Hiện trạng (đã kiểm chứng trên một máy Windows của team)

- Remote: `git@github.com:r2d-ai/superset.git`. Docker Compose v5.6.1.
- `.env` gốc chứa `SUPERSET_LOAD_EXAMPLES`, `SUPERSET_LOG_LEVEL`,
  `SUPERSET_DEBUG_ENABLED`: không có tác dụng (không được interpolate, không
  vào container).
- Biến Compose interpolate thật: `NGINX_PORT`, `SUPERSET_PORT`, `NODE_PORT`,
  `WEBSOCKET_PORT`, `DATABASE_PORT`, `REDIS_PORT`, `SUPERSET_BUILD_TARGET`,
  `INCLUDE_CHROMIUM`, `BUILD_TRANSLATIONS`, `SUPERSET_FORCE_LOAD_EXAMPLES`,
  `SCARF_ANALYTICS`.
- `superset-node`, `superset-websocket` có restart policy `no`; dừng cùng lúc
  (`Exited (255)`) khi Docker Desktop/WSL tắt và không tự lên lại. Các service
  khác `unless-stopped`.
- Repo trên filesystem Windows làm `uv pip install -e .` chậm (resolve ~1m32s)
  và cảnh báo hardlink → `superset` `unhealthy` vài phút sau mỗi lần start.
- Volume: `superset_home`, `db_home`, `redis`, `superset_data`. Bind mount
  thêm `./local_extensions`. `superset-node` dùng volume ẩn danh cho
  `node_modules`.
- `docker-bootstrap.sh`: worker/beat không reinstall app; `SUPERSET_DEBUG_ENABLED`
  bật Werkzeug debugger; `FLASK_DEBUG` mặc định 1; có chế độ `mcp`
  (`MCP_PORT`, mặc định 5008).
- Phiên bản: Python 3.11 (Dockerfile, `requires-python >=3.11`), Node `^24.16.0`,
  npm `^11.13.0`.

## Thay đổi

### 1. `.env` gốc

Chỉ giữ `COMPOSE_PROJECT_NAME` và 6 biến cổng. Bỏ `SUPERSET_LOAD_EXAMPLES`
(đã `yes` trong `docker/.env`). Chuyển `SUPERSET_LOG_LEVEL=INFO` và
`SUPERSET_DEBUG_ENABLED=false` sang `docker/.env-local` (gitignored, tạo mới).

### 2. Đổi tên `SETUP_WINDOWS.md` → `SETUP_LOCAL.md` (`git mv`)

Cấu trúc mới. Lệnh viết bằng bash; chỗ nào khác trên PowerShell thì ghi thêm
khối PowerShell ngay bên dưới.

1. Chọn môi trường — bảng so sánh: WSL2 (khuyên dùng trên Windows), Linux
   native, Windows PowerShell (chậm hơn do filesystem bridge).
2. Yêu cầu hệ thống — Docker Engine/Desktop, Compose >= 2.24.0, Git; Python
   3.11+, Node `^24.16.0` / npm `^11.13.0` chỉ cho chạy không Docker.
   WSL2: bật WSL integration trong Docker Desktop. Linux: user trong group
   `docker`.
3. Clone repo — WSL2/Linux: `git clone git@github.com:r2d-ai/superset.git ~/superset`.
   PowerShell: clone vào thư mục bất kỳ trên Windows, cảnh báo hiệu năng.
4. Cấu hình — `.env` gốc (cổng + biến build tùy chọn), `docker/.env-local`
   (biến container an toàn: `SUPERSET_LOG_LEVEL`, `SUPERSET_DEBUG_ENABLED`,
   `FLASK_DEBUG`, `ADMIN_PASSWORD`, `SUPERSET_SECRET_KEY`). Không đặt biến cổng
   vào `docker/.env-local`.
5. Khởi động, chờ sẵn sàng, kiểm tra — kiểm tra cổng (`ss -ltn` / PowerShell
   `Test-NetConnection`), `docker compose config -q`, `up -d`, theo dõi init,
   health check (`curl` / `curl.exe`). Sau khi restart máy/Docker dùng
   `docker compose up -d` (không phải `start`).
6. Cổng host vs cổng container — giữ nội dung cũ.
7. Chạy không Docker (Python/Node local) — chỉ cho Linux/WSL2 (`make venv`,
   `make install`...); ghi rõ native Windows fail (wheel `databend-driver`).
8. Truy cập và tài khoản — `admin`/`admin`, `admin@superset.com`, URL.
9. Lệnh quản lý + vòng đời phát triển — thêm: worker/beat không reinstall,
   `node_modules` là volume ẩn danh, `local_extensions/`, chế độ `mcp`;
   cảnh báo `down -v` liệt kê đủ 4 volume.
10. Xử lý sự cố — chung: init exit 1 do cổng nội bộ, lỗi `env_file`/`required`,
    `superset-node`/`superset-websocket` `Exited (255)` sau restart Docker,
    `unhealthy` khi start, cảnh báo hardlink của uv (vô hại), frontend trắng
    trang. WSL2/Linux: `fs.inotify.max_user_watches`, quyền file root-owned.
    Windows: dải cổng bị Hyper-V reserve (`netsh ... excludedportrange`).
11. Bảng file cấu hình — cập nhật theo các thay đổi trên.

Không ghi đường dẫn riêng của bất kỳ máy nào.

## Ngoài phạm vi

- Không sửa `docker-compose.yml` hay script trong `docker/` (tránh conflict khi
  merge `apache/master`).
- Không thêm `docker-compose.override.yml`.
- Không hướng dẫn macOS.

## Kiểm chứng

- `docker compose config -q` exit 0 sau khi sửa `.env`.
- `docker compose up -d` → cả 9 service chạy; `superset-node`,
  `superset-websocket` lên lại.
- `http://localhost:8088/health` trả `OK`;
  `http://localhost:9000/static/assets/manifest.json` trả `200`.
- Mọi lệnh, đường dẫn, tên biến trong doc khớp với file nguồn; không còn
  tham chiếu `SETUP_WINDOWS.md` trong repo (`rg SETUP_WINDOWS`).
