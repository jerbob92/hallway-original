#!/bin/sh

tmux start-server

tmux new-session -d -s hallway -n logs

tmux split-window -t hallway:logs
tmux split-window -t hallway:logs

tmux select-layout -t hallway:logs even-vertical

# XXX: Needed so the commands actually launch
sleep 1

tmux send-keys -t hallway:logs.0 "foreman start worker" C-m
tmux send-keys -t hallway:logs.1 "foreman start apihost" C-m
tmux send-keys -t hallway:logs.2 "foreman start dawg" C-m

tmux attach-session -t hallway
