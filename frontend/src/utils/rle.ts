export function encodeRLE(cells: Uint32Array | number[], width: number, height: number): string {
  let rle = `x = ${width}, y = ${height}, rule = B3/S23\n`;
  let currentLine = "";

  for (let y = 0; y < height; y++) {
    let row = "";
    let count = 0;
    let lastState = cells[y * width];

    for (let x = 0; x < width; x++) {
      const state = cells[y * width + x];
      if (state === lastState) {
        count++;
      } else {
        row += (count > 1 ? count : "") + (lastState === 1 ? "o" : "b");
        lastState = state;
        count = 1;
      }
    }

    // Add last run in row if it was alive
    if (lastState === 1) {
       row += (count > 1 ? count : "") + "o";
    } else {
        // if trailing dead cells, we usually skip them in RLE but for simplicity we can include them or skip
        // but if the whole row is dead, it's just "$"
    }

    currentLine += row + "$";
    if (currentLine.length > 70) {
        rle += currentLine + "\n";
        currentLine = "";
    }
  }

  rle += currentLine.slice(0, -1) + "!";
  return rle;
}

export function decodeRLE(rle: string): { cells: Uint32Array, width: number, height: number } {
  const lines = rle.split('\n');
  let width = 0, height = 0;
  let rleData = "";

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.includes('x =')) {
      const wMatch = line.match(/x\s*=\s*(\d+)/);
      const hMatch = line.match(/y\s*=\s*(\d+)/);
      if (wMatch) width = parseInt(wMatch[1]);
      if (hMatch) height = parseInt(hMatch[1]);
      continue;
    }
    rleData += line.trim();
  }

  const cells = new Uint32Array(width * height);
  let x = 0, y = 0;
  let countStr = "";

  for (let i = 0; i < rleData.length; i++) {
    const char = rleData[i];
    if (char >= '0' && char <= '9') {
      countStr += char;
    } else {
      const count = countStr === "" ? 1 : parseInt(countStr);
      countStr = "";

      if (char === 'b') {
        x += count;
      } else if (char === 'o') {
        for (let j = 0; j < count; j++) {
          if (x < width && y < height) {
            cells[y * width + x] = 1;
          }
          x++;
        }
      } else if (char === '$') {
        y += count;
        x = 0;
      } else if (char === '!') {
        break;
      }
    }
  }

  return { cells, width, height };
}
