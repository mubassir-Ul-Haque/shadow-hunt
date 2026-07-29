// Modular Maze Generator for Shadow Hunt
// Generates a grid-based maze with walls, open areas, dead ends, and safe routes.

export class MazeGenerator {
  constructor(width = 25, height = 17) {
    // Ensure odd dimensions for maze generation algorithm
    this.width = width % 2 === 0 ? width + 1 : width;
    this.height = height % 2 === 0 ? height + 1 : height;
    this.TILE_TYPES = {
      EMPTY: 0,
      WALL: 1,
      SAFE_ZONE: 2,
      POWERUP_SPAWN: 3
    };
  }

  generate() {
    const grid = Array.from({ length: this.height }, () =>
      Array(this.width).fill(this.TILE_TYPES.WALL)
    );

    // Recursive Backtracking maze generation
    const stack = [];
    const startX = 1;
    const startY = 1;

    grid[startY][startX] = this.TILE_TYPES.EMPTY;
    stack.push([startX, startY]);

    const directions = [
      [0, -2], [0, 2], [-2, 0], [2, 0]
    ];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const neighbors = [];

      // Shuffle directions for randomness
      const shuffledDirs = [...directions].sort(() => Math.random() - 0.5);

      for (const [dx, dy] of shuffledDirs) {
        const nx = cx + dx;
        const ny = cy + dy;

        if (
          nx > 0 && nx < this.width - 1 &&
          ny > 0 && ny < this.height - 1 &&
          grid[ny][nx] === this.TILE_TYPES.WALL
        ) {
          neighbors.push([nx, ny, cx + dx / 2, cy + dy / 2]);
        }
      }

      if (neighbors.length > 0) {
        // Pick random valid neighbor
        const [nx, ny, mx, my] = neighbors[Math.floor(Math.random() * neighbors.length)];
        grid[my][mx] = this.TILE_TYPES.EMPTY;
        grid[ny][nx] = this.TILE_TYPES.EMPTY;
        stack.push([nx, ny]);
      } else {
        stack.pop();
      }
    }

    // Carve central open arena for dynamic gameplay
    const midX = Math.floor(this.width / 2);
    const midY = Math.floor(this.height / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const ax = midX + dx;
        const ay = midY + dy;
        if (ax > 0 && ax < this.width - 1 && ay > 0 && ay < this.height - 1) {
          grid[ay][ax] = this.TILE_TYPES.EMPTY;
        }
      }
    }

    // Add extra loops/openings so it's not a strict tree (avoids pure funneling)
    for (let y = 2; y < this.height - 2; y += 2) {
      for (let x = 2; x < this.width - 2; x += 2) {
        if (grid[y][x] === this.TILE_TYPES.WALL && Math.random() < 0.25) {
          grid[y][x] = this.TILE_TYPES.EMPTY;
        }
      }
    }

    // Mark powerup spawn locations at dead-ends or key junctions
    const powerupSpawns = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (grid[y][x] === this.TILE_TYPES.EMPTY) {
          // Count adjacent wall neighbors
          let wallCount = 0;
          if (grid[y - 1][x] === this.TILE_TYPES.WALL) wallCount++;
          if (grid[y + 1][x] === this.TILE_TYPES.WALL) wallCount++;
          if (grid[y][x - 1] === this.TILE_TYPES.WALL) wallCount++;
          if (grid[y][x + 1] === this.TILE_TYPES.WALL) wallCount++;

          if (wallCount >= 3 && Math.random() < 0.6) {
            grid[y][x] = this.TILE_TYPES.POWERUP_SPAWN;
            powerupSpawns.push({ x, y });
          }
        }
      }
    }

    // Determine spawn points
    const spawnPoints = this.calculateSpawnPoints(grid);

    return {
      width: this.width,
      height: this.height,
      grid,
      powerupSpawns,
      spawnPoints
    };
  }

  calculateSpawnPoints(grid) {
    const emptyTiles = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (grid[y][x] === this.TILE_TYPES.EMPTY || grid[y][x] === this.TILE_TYPES.POWERUP_SPAWN) {
          emptyTiles.push({ x, y });
        }
      }
    }

    // Spread spawn points evenly across quadrants
    emptyTiles.sort(() => Math.random() - 0.5);
    return emptyTiles.slice(0, 16); // up to 16 potential spawn locations
  }
}
