export interface Block {
    id: number;
    w: number;
    h: number;
    x: number;
    y: number;
    name: string;
}

export function getBoardString(blocks: Block[]) {
    let board = Array(20).fill('0');
    for (let b of blocks) {
        if (b.w === 1 && b.h === 1) {
            board[b.y * 4 + b.x] = '1';
        } else if (b.w === 2 && b.h === 1) {
            board[b.y * 4 + b.x] = 'L';
            board[b.y * 4 + b.x + 1] = 'R';
        } else if (b.w === 1 && b.h === 2) {
            board[b.y * 4 + b.x] = 'U';
            board[(b.y + 1) * 4 + b.x] = 'D';
        } else if (b.w === 2 && b.h === 2) {
            board[b.y * 4 + b.x] = 'A';
            board[b.y * 4 + b.x + 1] = 'B';
            board[(b.y + 1) * 4 + b.x] = 'C';
            board[(b.y + 1) * 4 + b.x + 1] = 'E';
        }
    }
    return board.join('');
}

export interface Move {
    blockIndex: number;
    dx: number;
    dy: number;
}

export function getMoves(blocks: Block[]) {
    let board = Array(20).fill(-1);
    blocks.forEach((b, i) => {
        for(let dy=0; dy<b.h; dy++) {
            for(let dx=0; dx<b.w; dx++) {
                board[(b.y + dy) * 4 + (b.x + dx)] = i;
            }
        }
    });

    let moves: Move[] = [];
    blocks.forEach((b, i) => {
        const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
        for (let [dx, dy] of dirs) {
            let nx = b.x + dx;
            let ny = b.y + dy;
            if (nx < 0 || nx + b.w > 4 || ny < 0 || ny + b.h > 5) continue;

            let canMove = true;
            for(let cy=0; cy<b.h; cy++) {
                for(let cx=0; cx<b.w; cx++) {
                    let cellId = board[(ny + cy) * 4 + (nx + cx)];
                    if (cellId !== -1 && cellId !== i) {
                        canMove = false;
                        break;
                    }
                }
                if (!canMove) break;
            }
            if (canMove) {
                moves.push({ blockIndex: i, dx, dy });
            }
        }
    });
    return moves;
}
