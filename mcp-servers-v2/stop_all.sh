#!/bin/bash
# Stop all 5 MCP servers
for name in agent1_maturity agent2_recommendation agent3_campaign agent4_alert agent5_copilot; do
    pid=$(pgrep -f "${name}.py")
    if [ -n "$pid" ]; then
        echo "Stopping $name (PID $pid)..."
        kill $pid
    else
        echo "$name not running"
    fi
done
