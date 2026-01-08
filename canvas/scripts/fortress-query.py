#!/usr/bin/env python3
"""
Query fortress state via IPC and display useful information
"""
import json
import socket
import sys
import time

SOCKET_PATH = "/tmp/canvas-fortress-1.sock"

def query_state(socket_path=SOCKET_PATH):
    """Query the fortress state via Unix socket"""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(2)
        sock.connect(socket_path)

        # Send getState command
        sock.sendall(b'{"type":"getState"}\n')

        # Receive response
        data = b''
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            # Try to parse - if valid JSON, we're done
            try:
                json.loads(data.decode('utf-8'))
                break
            except:
                continue

        sock.close()

        response = json.loads(data.decode('utf-8'))
        return response.get('data', {})
    except Exception as e:
        print(f"Error querying fortress: {e}", file=sys.stderr)
        return None

def display_summary(state):
    """Display a summary of fortress state"""
    if not state:
        print("No state data available")
        return

    print("=" * 60)
    print(f"FORTRESS STATUS - Tick {state.get('tick', 0)}")
    print("=" * 60)

    # Resources
    resources = state.get('resources', {})
    print(f"\nRESOURCES:")
    print(f"  Wood: {resources.get('wood', 0)}")
    print(f"  Stone: {resources.get('stone', 0)}")
    print(f"  Food: {resources.get('food', 0)}")
    print(f"  Drink: {resources.get('drink', 0)}")

    # Dwarves
    dwarves = state.get('dwarves', [])
    print(f"\nDWARVES: {len(dwarves)}")
    for dwarf in dwarves[:5]:  # Show first 5
        job_info = ""
        if dwarf.get('currentJob'):
            job = dwarf['currentJob']
            job_info = f" → {job['type']} at ({job['x']}, {job['y']}) [{job['progress']}%]"
        print(f"  {dwarf['name']}: ({dwarf['x']}, {dwarf['y']}) [{dwarf['labor']}]{job_info}")

    if len(dwarves) > 5:
        print(f"  ... and {len(dwarves) - 5} more")

    # Jobs
    jobs = state.get('jobs', [])
    print(f"\nJOBS: {len(jobs)} pending")
    for job in jobs[:5]:  # Show first 5
        assigned = "assigned" if job.get('assignedDwarfId') is not None else "unassigned"
        print(f"  {job['type']} at ({job['x']}, {job['y']}) - {assigned}, {job['progress']}% done")

    if len(jobs) > 5:
        print(f"  ... and {len(jobs) - 5} more")

    # Season/Year
    print(f"\nTIME: Year {state.get('year', 0)}, {state.get('season', 'Unknown')}")
    print(f"Paused: {state.get('paused', False)}")

def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == '--raw':
            # Just dump raw JSON
            state = query_state()
            if state:
                print(json.dumps(state, indent=2))
        elif sys.argv[1] == '--jobs':
            # Just show jobs
            state = query_state()
            if state:
                jobs = state.get('jobs', [])
                print(json.dumps(jobs, indent=2))
        elif sys.argv[1] == '--dwarves':
            # Just show dwarves
            state = query_state()
            if state:
                dwarves = state.get('dwarves', [])
                print(json.dumps(dwarves, indent=2))
        else:
            print("Usage: fortress-query.py [--raw|--jobs|--dwarves]")
    else:
        # Show summary
        state = query_state()
        if state:
            display_summary(state)

if __name__ == "__main__":
    main()
