"""
Narrative V2 pipeline.

Architecture: state+delta → storyline store → prep → Opus planner → Sonnet writer → validator

Modules:
  delta_engine  — deterministic candidate events from state changes
  clusters      — audience cluster detection (twin players)
  storylines    — storyline store CRUD + lifecycle management
  prep          — compact planner packet assembly
  planner       — Opus LLM planner call (should_post, assignments, storyline actions)
  writer        — Sonnet LLM writer call (executes one assignment at a time)
  validator     — hard-reject validation (word caps, frame checks, rootFor consistency)
  pipeline      — orchestrator that wires everything together
"""
