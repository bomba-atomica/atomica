# New Module Development Guide

This guide outlines the mandatory workflow for all agents (AI and human) when starting development of a new module or significant feature. The process is designed to maximize context, minimize hallucinations, and ensure rigorous quality control through a structured "Plan -> Stub -> Implement" cycle.

## 1. Specification & Planning (High-Capability Agent)

**Agent Profile:** High-Context Window, Reasoning-Heavy (e.g., Claude 3 Opus, GPT-4o).

Before writing a single line of code, a comprehensive plan must be created.

1.  **Create Plan Document**:
    *   **Location**: `docs/plan/<module_name>_plan.md`
    *   **Content**:
        *   **Product Features**: Clear definition of what is being built.
        *   **Technical Implementation**: Specific libraries, patterns, and architectural decisions.
        *   **Prioritization**: Ordered list of tasks.
            *   Must be incremental (buildable pieces).
            *   **Risk-First**: Prioritize items that remove the biggest technical risks/unknowns early.

2.  **Feasibility Review**:
    *   The same or a similarly capable agent must review the plan for:
        *   Technical correctness.
        *   Viability (can this actually be built?).
        *   Context sufficiency (does a lower-context agent have enough info to execute?).
    *   **Output**: Do *not* create a separate review doc. Directly edit and improve the original plan document.

## 2. The "Living Plan" Protocol

The plan document is **not static**. It is the source of truth for the project's state.

*   **Update Trigger**: Whenever a task is completed, a blocker is found, or new information is learned.
*   **Actions**:
    *   Mark items as `[x] Complete`.
    *   Mark items as `[ ] Blocked` (with reason).
    *   Remove or descope items that are no longer needed.
    *   **Refactor Plan**: If implementation reveals that the initial plan was wrong, rewrite the relevant sections of the plan to reflect reality.

## 3. Stubbing (High-Capability Agent)

**Agent Profile:** High-Context Window, Reasoning-Heavy.

Before implementing logic, structure the codebase.

1.  **Generate Stubs**:
    *   Create all file structures, classes, and function signatures.
    *   **Documentation**:
        *   Create a `README.md` in the module root.
        *   Write **extensive** inline code comments (JSDoc/Docstring) explaining parameters, return values, and logic flow.
    *   **Compilability**: The code must compile and pass linting (use `throw new Error("Not implemented")` or similar).
2.  **Stub Tests**:
    *   Create test files corresponding to the source files.
    *   Write test cases (signatures only or failing tests) that describe expected behavior.
3.  **Commit**: Commit the stubs.
4.  **Update Plan**: Mark the "Stubbing" phase as complete in the plan.

## 4. TDD Implementation (Standard Agent)

**Agent Profile:** Cost-Effective, Fast (e.g., Claude 3.5 Sonnet, Gemini 1.5 Pro, GPT-4o-mini).

Fill in the blanks using Test-Driven Development (TDD).

1.  **Write Tests First**:
    *   Before implementing a function, ensure the specific test case exists and fails.
    *   Tests should serve as documentation for how the code is used.
2.  **Implement Logic**:
    *   Write the minimum code necessary to make the test pass.
    *   Maintain the extensive inline documentation. If logic changes, update the comments.
    *   **References**: Link comments to design docs or the plan file where applicable.
3.  **Cycle**:
    *   `Red` (Fail test) -> `Green` (Pass test) -> `Refactor`.
4.  **Continuous Plan Updates**:
    *   After completing a logical unit, update `docs/plan/<module_name>_plan.md` to reflect progress.

## 5. Iteration Loop

Repeat the cycle:
1.  Check the Plan.
2.  Pick the next high-priority/high-risk task.
3.  Implement (TDD).
4.  Update Plan.
5.  Commit.

## Summary Checklist

*   [ ] **Plan**: Created by Opus-level agent. Prioritized for risk.
*   [ ] **Review**: Plan validated for technical feasibility.
*   [ ] **Stub**: Structure created with verbose comments & compiling code.
*   [ ] **Implement**: TDD approach (Tests -> Code -> Refactor).
*   [ ] **Maintain**: Plan updated after every significant step.
