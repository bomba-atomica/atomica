# Timezone Choropleth Visualization: Concept & GIS Methodology

This document defines the user experience and geospatial methodology for the "Timezone Choropleth" visualization. The objective is to render a world map where **landmasses are segmented and colored according to their specific timezones**.

## Core User Experience
The user is presented with a global map where:
1.  **Land-Only Visualization**: Oceans remain neutral/unfilled. Only major continents and islands are effectively rendered.
2.  **Timezone-Based Coloring**: Every segment of land is filled with a color corresponding to its UTC Offset (or specific Timezone ID).
3.  **Political-Temporal Intersection**:
    *   If a country lies entirely within one timezone (e.g., Germany), it is rendered as a single solid shape with that timezone's color.
    *   If a country spans multiple timezones (e.g., USA, Russia, Brazil), the country's geometry is **bisected** along the timezone boundaries.
    *   Each resulting segment is colored independently based on its local timezone, effectively showing the "temporal topography" of the nation.

## GIS Terminology & Methodology

To achieve this visualization, we employ specific Geographic Information System (GIS) operations:

### 1. Geospatial Intersection (Overlay Analysis)
The core operation is the **Intersection** of two primary polygon datasets:
*   **Political Boundaries Layer**: The geometry of countries (e.g., Natural Earth Admin 0).
*   **Temporal Boundaries Layer**: The geometry of timezones (e.g., Natural Earth Time Zones).

Mathematically, for every Country Polygon ($C$) and Timezone Polygon ($T$), we compute the geometric intersection $I = C \cap T$.
*   If $I$ is empty ($I = \emptyset$), that timezone does not touch that country.
*   If $I$ is non-empty, the resulting geometry $I$ represents the specific geographic area of *Country C* that observes *Timezone T*.

### 2. Polygon Clipping & Split Operations
Regions that span multiple timezones undergo **Polygon Clipping**. The timezone boundaries act as "cutter" lines that slice the country polygon into smaller, discrete features.
*   *Example*: The polygon for "United States" is clipped against the "Pacific Standard Time", "Mountain Standard Time", etc. polygons.
*   *Result*: A set of new, smaller polygons (artifacts) that perfectly tessellate to form the original country shape, but carry distinct temporal attributes.

### 3. Choropleth Mapping (Nominal/Ordinal)
The visual output is a **Choropleth Map**, where areas are colored (shaded/patterned) in proportion to a statistical variable—in this case, the **UTC Offset**.
*   **Variable**: UTC Offset (e.g., -5, +0, +9).
*   **Classification**: This data is ordinal (time moves sequentially), allowing for a sequential or diverging color scale (e.g., a spectral ramp from West to East) to intuitive visualize the progression of time across the globe.

### 4. Implementation Strategy (TopoJSON Mesh)
In a web-based implementation (using D3.js and TopoJSON):
*   We do not simply layer the datasets. Layering causes "Z-fighting" or obscures the political borders.
*   Instead, we rely on the **Geometric Intersection** of the logic to distinct land-features.
*   **Optimal Approach**: Use the Timezone dataset as the *primary* geometry for rendering, but strictly **Clip** it using the World Landmask (merged country geometry). This ensures that we only render timezone colors where land exists, effectively treating the Timezone polygons as the texture of the land.

## Visual Goal
The final result is a "Time Faceted" view of the world, where political borders are respected but internal divisions are dictated by the sun's position relative to human timekeeping.
