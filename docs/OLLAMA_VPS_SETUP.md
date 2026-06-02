# Ollama on Linux VPS (SocialMediaLite)

Guide for installing and running **Ollama** on a small VPS for the planned **AI profile summaries** feature (`docs/plan/ai-profile-summaries.plan.md`). Use a **small CPU-only model** on ~8 GiB RAM; use **Groq / Gemini** hosted free tiers if quality or speed is insufficient.

---

## Check machine strength (before install)

Run on the VPS:

```bash
echo "=== CPU ===" && lscpu | grep -E 'Model name|CPU\(s\)|Thread|Core|MHz' && \
echo "=== RAM ===" && free -h && \
echo "=== Disk (models need GB) ===" && df -h ~ /var /tmp 2>/dev/null && \
echo "=== GPU ===" && (command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv || echo "no nvidia-smi") && \
echo "=== ROCm (AMD) ===" && (command -v rocm-smi >/dev/null && rocm-smi --showproductname --showmeminfo vram 2>/dev/null || echo "no rocm-smi")
```

### Example: 4 vCPU, 8 GiB RAM, no GPU

| Resource | Typical value | Implication |
|----------|---------------|-------------|
| CPU | 4 vCPUs (e.g. Haswell) | OK for **3B** models; generation can take **30s–several minutes** per summary. |
| RAM | ~8 GiB total, ~6 GiB available | Use **3B** quantized models; **7B** is tight with Postgres + Node running. |
| Swap | Often **0** on VPS | Add **2–4 GiB swap** to avoid OOM kills. |
| Disk | 100+ GiB free | Plenty for models under `~/.ollama`. |
| GPU | None | **CPU-only** inference. |

**Recommended models on this class of VPS:**

- `llama3.2:3b`
- `qwen2.5:3b`
- `phi3:mini`

Avoid 13B+ and be cautious with 7B while the API and database share the same host.

---

## Install Ollama

Official installer (Linux):

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

If `curl` is missing (Debian/Ubuntu):

```bash
sudo apt update && sudo apt install -y curl
```

Manual instructions: https://docs.ollama.com/linux

---

## Start the service

```bash
sudo systemctl enable ollama
sudo systemctl start ollama
sudo systemctl status ollama
```

API default: **http://127.0.0.1:11434**

Verify:

```bash
curl http://127.0.0.1:11434/api/tags
```

---

## Pull a small model

```bash
ollama pull llama3.2:3b
```

Alternatives: `qwen2.5:3b`, `phi3:mini`.

Check disk use:

```bash
du -sh ~/.ollama
```

---

## Quick tests

Interactive:

```bash
ollama run llama3.2:3b "Say hello in one sentence."
```

HTTP (same style as OpenAI-compatible clients):

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.2:3b",
  "prompt": "Say hello in one sentence.",
  "stream": false
}'
```

Watch memory while generating (another SSH session):

```bash
watch -n1 free -h
```

---

## Add swap (recommended on 8 GiB VPS with no swap)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Confirm:

```bash
free -h
```

---

## SocialMediaLite configuration

When the AI summary feature is implemented, point the API at Ollama **on localhost only**. Do **not** expose port `11434` to the public internet.

Add to the repo root `.env` (see `.env.example` when added):

```env
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2:3b
AI_SUMMARY_RATE_LIMIT_PER_HOUR=3
```

For local development on a workstation, the same `LLM_BASE_URL` works if Ollama is running there.

Use `LLM_PROVIDER=stub` in CI/tests with no Ollama installed.

---

## Security

- Bind Ollama to **127.0.0.1** only (default for the systemd service on most installs).
- Block **11434** in the host firewall from WAN.
- Only the Node **apps/api** process on the same machine should call Ollama.

---

## If Ollama is too slow or weak on the VPS

Use a hosted free-tier API from the server instead (no local model RAM):

| Provider | Notes |
|----------|--------|
| [Groq](https://console.groq.com/) | OpenAI-compatible, fast, free tier |
| [Google AI Studio](https://aistudio.google.com/app/apikey) | Gemini Flash, generous free tier; region limits may apply |

See **Free LLM options** in `docs/plan/ai-profile-summaries.plan.md`.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `connection refused` on 11434 | `sudo systemctl start ollama` and check `status` |
| OOM / process killed | Smaller model, add swap, stop other heavy services |
| Very slow output | Expected on CPU-only VPS; use 3B model or hosted API |
| Install script fails | Install `curl`; check `cat /etc/os-release` and installer logs |

---

## Related docs

- `docs/plan/ai-profile-summaries.plan.md` — feature design and LLM provider abstraction
- `docs/PHASE1_GOALS.md` — Phase 1 product scope
