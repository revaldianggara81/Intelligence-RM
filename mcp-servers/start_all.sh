#!/usr/bin/env bash
# Start all 5 PAF agent MCP (SSE) servers in the background.
set -e
cd "$(dirname "$0")"
mkdir -p logs
PY=./../venv/bin/python
[ -x "$PY" ] || PY=python3

declare -A SERVERS=(
  [agent1_maturity]=agent1_maturity.py
  [agent2_recommendation]=agent2_recommendation.py
  [agent3_campaign]=agent3_campaign.py
  [agent4_alert]=agent4_alert.py
  [agent5_copilot]=agent5_copilot.py
)

for name in "${!SERVERS[@]}"; do
  script=${SERVERS[$name]}
  nohup "$PY" "$script" > "logs/${name}.log" 2>&1 &
  echo "$!" > "logs/${name}.pid"
  echo "Started $name (pid $(cat logs/${name}.pid)) -> logs/${name}.log"
done
