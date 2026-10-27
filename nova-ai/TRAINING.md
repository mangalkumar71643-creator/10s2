# Apna AI model train karke jodna

ChatGPT jaisa model shuru se (zero se) train karna bahut mehenga hai — hazaaron GPU aur crore
rupaye. Isliye practical tareeka hai: **ek open-source model lo aur use apne data par fine-tune
karo.** Yeh ek GPU (ya Google Colab) par ho sakta hai.

## 1. Data ikattha karein

Server ki `.env` me `SAVE_CHATS=1` set karein. Har poori chat `server/data/conversations.jsonl`
me ek line ke roop me save hogi, is format me:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

Yahi format OpenAI fine-tuning, Unsloth, Axolotl aur Hugging Face TRL sab samajhte hain.
Training se pehle kharab/galat jawab hata dein aur achhe jawab khud likh kar jod dein —
model utna hi achha banega jitna data achha hoga.

> Users ki chats save karne se pehle unhe batayein aur unki permission lein (privacy policy).

## 2. Base model chunein

Hindi/Hinglish ke liye shuruaat me achhe options: Llama 3.x (8B), Qwen 2.5/3 (7B), Gemma (2B–9B),
Sarvam ya Krutrim jaise Indian models. Chhota model = sasta aur tez, bada = zyada samajhdar.

## 3. Fine-tune karein (LoRA)

Sabse aasan: **Unsloth** ke free Google Colab notebooks — apni `conversations.jsonl` upload karo,
base model chuno, run karo. Ya **Hugging Face TRL** ka `SFTTrainer`.

## 4. Model ko serve karein

Trained model ko kisi OpenAI-compatible server se chalayein:

```bash
# Option A: Ollama (GGUF export karke)
ollama create nova -f Modelfile
# Option B: vLLM (GPU server par)
vllm serve ./my-finetuned-model --served-model-name nova --port 8000
```

## 5. App se jodein

`server/.env`:

```
PROVIDER=openai
OPENAI_BASE_URL=http://localhost:8000/v1   # Ollama ke liye http://localhost:11434/v1
MODEL=nova
```

Server restart karein — app ab aapke model se baat karega. App me kuch badalna nahi padega.
