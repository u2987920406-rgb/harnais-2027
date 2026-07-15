#!/bin/bash
# Reactivation heartbeat — GLM 5.2 cloud via Ollama
# Lance a 2:10 AM (daily). Verifie si la limite de debit (rate limit) GLM 5.2
# cloud est levee, redemarre Ollama si necessaire, et rapport au stdout.
# L'utilisateur fait ensuite le switch manuel via le skill /model.

OLLAMA="http://localhost:11434"
MODEL="glm-5.2:cloud"
LOG="D:/HERMES AGENT/harnais 2027/data/glm-reactivation.log"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

echo "=== [$TS] GLM 5.2 reactivation check ===" >> "$LOG"

# 1. Ollama joignable ?
tags=$(curl -s -m 10 "$OLLAMA/api/tags" 2>/dev/null)
if [ -z "$tags" ]; then
  echo "[$TS] Ollama NON joignable — tentative de demarrage..." >> "$LOG"
  # tente un demarrage propre (ignore l'erreur si deja actif)
  ollama serve >/dev/null 2>&1 &
  sleep 6
  tags=$(curl -s -m 10 "$OLLAMA/api/tags" 2>/dev/null)
  if [ -z "$tags" ]; then
    echo "[$TS] Ollama toujours injoignable — impossible de tester GLM 5.2" >> "$LOG"
    echo "STATUT: OLLAMA_DOWN"
    exit 0
  fi
fi

# 2. Le modele glm-5.2:cloud est-il present dans Ollama ?
if ! echo "$tags" | grep -q "$MODEL"; then
  echo "[$TS] Modele $MODEL absent — tentative de pull..." >> "$LOG"
  ollama pull "$MODEL" >/dev/null 2>&1
fi

# 3. Test minimal de generation (detecte le rate limit)
resp=$(curl -s -m 40 -X POST "$OLLAMA/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"ping\",\"stream\":false}" 2>/dev/null)

# 4. Analyse de la reponse
if echo "$resp" | grep -qiE "rate|limit|429|too many|quota"; then
  echo "[$TS] GLM 5.2 cloud ENCORE LIMITÉ: $(echo "$resp" | head -c 160)" >> "$LOG"
  echo "STATUT: LIMITED"
  exit 0
fi

if echo "$resp" | grep -qiE "\"error\""; then
  echo "[$TS] GLM 5.2 cloud ERREUR: $(echo "$resp" | head -c 160)" >> "$LOG"
  echo "STATUT: ERROR"
  exit 0
fi

if echo "$resp" | grep -qiE "\"response\""; then
  echo "[$TS] GLM 5.2 cloud RÉTABLI — pret pour switch manuel /model" >> "$LOG"
  echo "STATUT: OK"
  exit 0
fi

echo "[$TS] Reponse inattendue: $(echo "$resp" | head -c 160)" >> "$LOG"
echo "STATUT: UNKNOWN"
