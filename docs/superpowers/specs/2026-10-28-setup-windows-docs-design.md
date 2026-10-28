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

# Spec: Cập nhật SETUP_WINDOWS.md theo môi trường thực tế

## Mục tiêu

`SETUP_WINDOWS.md` mô tả đúng cách stack dev đang chạy trên máy Windows của team
(PowerShell, repo trên ổ `D:\`), đúng với `docker-compose.yml`, `docker/.env`,
`docker/docker-init.sh`, `docker/docker-bootstrap.sh`, `docker/docker-frontend.sh`
hiện tại. `.env` gốc chỉ còn biến thật sự được Compose interpolate.

## Hiện trạng (đã kiểm chứng)

- Repo ở `D:\Code\AI\GameBI\superset`, lệnh chạy từ PowerShell. Remote:
  `git@github.com:r2d-ai/superset.git`. Docker Compose v5.6.1.
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
- Repo trên `D:\` làm `uv pip install -e .` chậm (resolve ~1m32s) và cảnh báo
  hardlink → `superset` `unhealthy` vài phút sau mỗi lần start.
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

### 2. `SETUP_WINDOWS.md` — cấu trúc mới

1. Yêu cầu hệ thống — bảng phiên bản cập nhật; Compose >= 2.24.0.
2. Clone repo — remote `r2d-ai`, đặt trên ổ `D:\`, chạy từ PowerShell; ghi rõ
   cái giá hiệu năng và trỏ sang mục WSL2.
3. Cấu hình — `.env` gốc (cổng + biến build tùy chọn), `docker/.env-local`
   (biến container an toàn: `SUPERSET_LOG_LEVEL`, `SUPERSET_DEBUG_ENABLED`,
   `FLASK_DEBUG`, `ADMIN_PASSWORD`, `SUPERSET_SECRET_KEY`). Không đặt biến cổng
   vào `docker/.env-local`.
4. Khởi động, chờ sẵn sàng, kiểm tra — giữ nội dung cũ; thêm: sau khi restart
   máy/Docker Desktop dùng `docker compose up -d` (không phải `start`).
5. Cổng host vs cổng container — giữ nguyên.
6. Python local — rút gọn, giữ lý do fail trên Windows.
7. Truy cập và tài khoản — giữ nguyên (`admin`/`admin`, `admin@superset.com`).
8. Lệnh quản lý + vòng đời phát triển — thêm: worker/beat không reinstall,
   `node_modules` là volume ẩn danh, `local_extensions/`, chế độ `mcp`;
   cảnh báo `down -v` liệt kê đủ 4 volume.
9. Xử lý sự cố — thêm: `superset-node`/`superset-websocket` `Exited (255)` sau
   restart Docker; `unhealthy` kéo dài trên ổ `D:\`; cảnh báo hardlink của uv
   (vô hại).
10. Phụ lục WSL2 — khi nào nên chuyển, cách clone vào filesystem Linux.
11. Bảng file cấu hình — cập nhật theo các thay đổi trên.

## Ngoài phạm vi

- Không sửa `docker-compose.yml` hay script trong `docker/` (tránh conflict khi
  merge `apache/master`).
- Không thêm `docker-compose.override.yml`.

## Kiểm chứng

- `docker compose config -q` exit 0 sau khi sửa `.env`.
- `docker compose up -d` → cả 9 service chạy; `superset-node`,
  `superset-websocket` lên lại.
- `http://localhost:8088/health` trả `OK`;
  `http://localhost:9000/static/assets/manifest.json` trả `200`.
- Mọi lệnh, đường dẫn, tên biến trong doc khớp với file nguồn.
