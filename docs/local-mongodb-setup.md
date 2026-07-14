# Local MongoDB Setup Without Docker

Install MongoDB Community Server using the official package for your operating system and run it as a local service. Confirm connectivity with `mongosh mongodb://127.0.0.1:27017`.

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The default database is `hospital_mis`. Use a separate database such as `hospital_mis_test` for integration testing. Never point reset or demo-seed commands at production. The seed is repeatable and inserts only missing fictional baseline data.
