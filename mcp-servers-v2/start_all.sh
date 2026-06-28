#!/bin/bash
# Start all 5 MCP servers (streamable-http) in background
cd "$(dirname "$0")"
mkdir -p logs

for i in 1 2 3 4 5 6; do
    case $i in
        1) name="agent1_maturity" ;;
        2) name="agent2_recommendation" ;;
        3) name="agent3_campaign" ;;
        4) name="agent4_alert" ;;
        5) name="agent5_copilot" ;;
        6) name="agent6_yahoo_finance" ;;
    esac
    echo "Starting $name..."
    nohup ./../venv/bin/python ${name}.py > logs/${name}.log 2>&1 & disown
done

sleep 2
echo ""
echo "All agents started. Endpoints:"
echo "  Agent 1 Maturity Reminder    → http://0.0.0.0:9011/mcp"
echo "  Agent 2 Product Recommendation → http://0.0.0.0:9012/mcp"
echo "  Agent 3 Campaign Manager     → http://0.0.0.0:9013/mcp"
echo "  Agent 4 Alert Manager        → http://0.0.0.0:9014/mcp"
echo "  Agent 5 Universal Copilot    → http://0.0.0.0:9015/mcp"
echo "  Agent 6 Yahoo Finance        → http://0.0.0.0:9016/mcp"
