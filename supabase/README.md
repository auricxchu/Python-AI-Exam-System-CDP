## AI 云代理部署

需要部署 3 个 Supabase Edge Functions：

- `admin-get-ai-settings`
- `admin-upsert-ai-settings`
- `ai-proxy`

先执行 SQL：

```sql
\i supabase/sql/ai_provider_settings.sql
```

然后部署函数：

```bash
supabase functions deploy admin-get-ai-settings
supabase functions deploy admin-upsert-ai-settings
supabase functions deploy ai-proxy
```

这些函数依赖 Supabase Edge Runtime 自带的环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

教师端保存 AI 设置时会调用：

- `admin-upsert-ai-settings`

教师端登录成功后读取云端 AI 设置时会调用：

- `admin-get-ai-settings`

学生端和阅卷端调用 AI 时会走：

- `ai-proxy`

当前设计说明：

- 教师密码通过请求头 `x-admin-password` 做校验
- 原始 AI Key 只存 Supabase 表 `ai_provider_settings`
- 学生端不会直接拿到第三方 AI Key
