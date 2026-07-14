# Environment Variables

| Variable                              | Process    | Purpose                              |
| ------------------------------------- | ---------- | ------------------------------------ |
| `NODE_ENV`                            | API/worker | Runtime mode                         |
| `API_PORT`                            | API        | HTTP and Socket.IO port              |
| `MONGODB_URI`                         | API/worker | Standalone MongoDB connection string |
| `MONGODB_APP_NAME`                    | API/worker | MongoDB client application name      |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | API/worker | Initial database selection timeout   |
| `LOG_LEVEL`                           | API/worker | Structured log level                 |
| `CORS_ORIGINS`                        | API        | Comma-separated allowed web origins  |
| `SOCKET_IO_PATH`                      | API        | Socket.IO endpoint path              |
| `READINESS_TIMEOUT_MS`                | API        | Per-dependency readiness timeout     |
| `WORKER_ID`                           | Worker     | Unique operational worker identity   |
| `WORKER_HEALTH_INTERVAL_MS`           | Worker     | Dependency heartbeat interval        |
| `WORKER_SHUTDOWN_TIMEOUT_MS`          | Worker     | Forced shutdown deadline             |
| `VITE_API_BASE_URL`                   | Web build  | REST API base path                   |
| `VITE_SOCKET_URL`                     | Web build  | Socket.IO origin                     |
| `VITE_SOCKET_PATH`                    | Web build  | Socket.IO path                       |

Production secrets must be injected by the deployment platform. `.env` files are for local development only.
