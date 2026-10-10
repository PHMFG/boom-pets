// Emoji drawn to textures, for emote bubbles, slot reels and the Mystery Cube.
// One texture per distinct picture, made on first use and kept.
import { CanvasTexture, SRGBColorSpace } from 'three';
import { colors } from '../../shared/tokens';

const SIZE = 128;
const cache = new Map<string, CanvasTexture>();

function draw(key: string, paint: (context: CanvasRenderingContext2D) => void): CanvasTexture {
  let texture = cache.get(key);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext('2d')!;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    paint(context);
    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    cache.set(key, texture);
  }
  return texture;
}

const emojiFont = (pixels: number) => `${pixels}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

/** An emoji in a round speech bubble with an ink outline. */
export function bubbleTexture(emoji: string): CanvasTexture {
  return draw(`bubble:${emoji}`, context => {
    context.fillStyle = colors.cream;
    context.strokeStyle = colors.ink;
    context.lineWidth = 9;
    context.beginPath();
    context.arc(SIZE / 2, SIZE / 2 - 6, SIZE / 2 - 14, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    // The little tail that points at the speaker.
    context.beginPath();
    context.moveTo(SIZE / 2 - 14, SIZE - 26);
    context.lineTo(SIZE / 2, SIZE - 4);
    context.lineTo(SIZE / 2 + 14, SIZE - 26);
    context.fill();
    context.stroke();
    context.font = emojiFont(62);
    context.fillText(emoji, SIZE / 2, SIZE / 2 - 2);
  });
}

/** An emoji on a coloured tile with an ink border: a slot reel face or the side of a cube. */
export function tileTexture(emoji: string, background: string): CanvasTexture {
  return draw(`tile:${emoji}:${background}`, context => {
    context.fillStyle = colors.ink;
    context.fillRect(0, 0, SIZE, SIZE);
    context.fillStyle = background;
    context.fillRect(10, 10, SIZE - 20, SIZE - 20);
    context.font = emojiFont(76);
    context.fillText(emoji, SIZE / 2, SIZE / 2 + 4);
  });
}

/** Bold text on a tile, for the question mark on a Mystery Cube. */
export function labelTexture(text: string, background: string, ink: string): CanvasTexture {
  return draw(`label:${text}:${background}:${ink}`, context => {
    context.fillStyle = colors.ink;
    context.fillRect(0, 0, SIZE, SIZE);
    context.fillStyle = background;
    context.fillRect(10, 10, SIZE - 20, SIZE - 20);
    context.fillStyle = ink;
    context.font = `92px 'Lilita One', sans-serif`;
    context.fillText(text, SIZE / 2, SIZE / 2 + 6);
  });
}
