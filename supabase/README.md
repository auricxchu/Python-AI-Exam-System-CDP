## Supabase 数据库部署

### 1. 执行 SQL（按顺序）

```bash
psql <supabase-db-url> -f supabase/sql/question_bank.sql
psql <supabase-db-url> -f supabase/sql/exam_reports.sql
psql <supabase-db-url> -f supabase/sql/ai_provider_settings.sql
psql <supabase-db-url> -f supabase/sql/exam_feedbacks.sql
psql <supabase-db-url> -f supabase/sql/storage_buckets.sql
```

也可以在 Supabase Dashboard → SQL Editor 中依次粘贴执行。

### 2. 部署 Edge Functions

```bash
supabase functions deploy admin-get-ai-settings
supabase functions deploy admin-upsert-ai-settings
supabase functions deploy ai-proxy
```

### 3. 环境变量

Edge Functions 依赖 Supabase Edge Runtime 自带的环境变量：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. 资源清单

| SQL 文件 | 创建的资源 |
|---|---|
| `question_bank.sql` | `question_bank` 表（题库/试卷配置） |
| `exam_reports.sql` | `exam_reports` 表（考试报告记录） |
| `ai_provider_settings.sql` | `ai_provider_settings` 表（AI 密钥，仅 Edge Function 访问） |
| `exam_feedbacks.sql` | `exam_feedback_tickets` 表 + `exam-feedbacks` bucket（反馈工单） |
| `storage_buckets.sql` | `exam-assets` bucket（题目配图）+ `exam-reports` bucket（报告文件） |

### 5. 安全说明

- `question_bank`、`exam_reports` 等业务表允许 anon 读写，通过前端 Supabase anon key 直接访问
- `ai_provider_settings` 表只允许 Edge Function（service_role）访问，第三方 AI Key 不会暴露到前端
- 教师操作（保存 AI 设置）通过 `x-admin-password` 请求头在 Edge Function 中校验
