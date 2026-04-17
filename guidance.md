# AI Agent Guidance: Electland Election Simulator

This document provides a roadmap for AI agents to understand and navigate the Electland Election Simulator repository efficiently.

## Project Overview
Electland is a procedural election simulator focused on local town council and mayoral races. It generates fictional towns, demographic "blocs," political parties, and wards. The simulation runs week-by-week, showing how events and party momentum influence polling results.

## Core Files & Roles

### 1. Data & Logic (The "Brain")
*   **[src/types/sim.ts](file:///home/indigo/Code/elections/electland/src/types/sim.ts)**:
    *   **Purpose**: Contains all interface and type definitions for the simulation state (`World`, `Constituency`, `PartyDefinition`, `PoliticalValues`, etc.).
    *   **Key Interface**: `PoliticalValues` (change, growth, services) is the core 3-dimensional political space used for matching voters to parties.
*   **[src/lib/sim.ts](file:///home/indigo/Code/elections/electland/src/lib/sim.ts)**:
    *   **Purpose**: The "engine" of the simulator.
    *   **Functions**:
        *   `generateWorld`: Creates a new town, its landmass, settlement centers, population tiles, and constituencies.
        *   `simulateWeek`: Advances time, processes geographic "currents" (events), and updates party momentum.
        *   `calculateResults`: Performs the actual vote counting logic based on voter affinity to party values.
        *   Voter Affinity: Based on a softmax of scores calculated from spatial geometry (ward fit), value matching, organization, and event bonuses.

### 2. UI Components (The "Look")
*   **[src/App.tsx](file:///home/indigo/Code/elections/electland/src/App.tsx)**:
    *   **Purpose**: Main entry point and state coordinator.
    *   **Functionality**: Manages the `world` state, the "Main Menu" overlay, and the layout of the "Newspaper" interface.
*   **[src/components/MapFigure.tsx](file:///home/indigo/Code/elections/electland/src/components/MapFigure.tsx)**:
    *   **Purpose**: Renders the SVG map of wards.
    *   **Details**: Uses Voronoi cells (calculated in `sim.ts` via `d3-delaunay`) to represent regional wards.
*   **[src/components/ConstituencyInspector.tsx](file:///home/indigo/Code/elections/electland/src/components/ConstituencyInspector.tsx)**:
    *   **Purpose**: Detail view for a specific selected ward.
    *   **Details**: Shows current leads, "What the voters say" headlines, and demographic mix.
*   **[src/components/PartyWorkbench.tsx](file:///home/indigo/Code/elections/electland/src/components/PartyWorkbench.tsx)**:
    *   **Purpose**: Interface for viewing and creating custom parties.

### 3. Styling
*   **[src/App.css](file:///home/indigo/Code/elections/electland/src/App.css)** & **[src/index.css](file:///home/indigo/Code/elections/electland/src/index.css)**:
    *   **Theme**: Modern "newspaper" aesthetic (serif fonts, ink-style buttons, textured paper background).

## Simulation Logic Explained

### Voter Behavior
Voters are represented in `PopulationTile` objects. Each tile has:
1.  **Values**: A set of `PoliticalValues` (Change, Growth, Services).
2.  **Bloc Mix**: A distribution of demographic groups (e.g., "Market Regulars", "College Corner Crowd").
3.  **Affinity**: During calculation, voters compare their `values` to each `PartyDefinition.values`, modified by `salience` (how much they care about specific axes).

### Procedural Generation
1.  **Landmass**: Random polygon shape.
2.  **Centers**: Points of interest (Market, School, Industrial) that influence density and urbanity.
3.  **Wards**: Voronoi cells seeded from population-weighted points.

## Quick Start for Agents
*   **To change how votes are counted**: Edit `calculateResults` in `src/lib/sim.ts`.
*   **To add new demographic groups**: Add templates to `fictionalBlocTemplates` in `src/lib/sim.ts`.
*   **To tweak the UI layout**: Start in `src/App.tsx` and check the corresponding component in `src/components/`.
*   **To add a new political issue/axis**: Update `PoliticalValues` in `src/types/sim.ts` and initialize it in helpers in `src/lib/sim.ts`.

## Tech Stack
*   React 18
*   TypeScript
*   Vite
*   d3-delaunay (for Voronoi/Delaunay map geometry)
