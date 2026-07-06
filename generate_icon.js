import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const input = path.join(__dirname, 'public', 'quantlib.svg');
const output = path.join(__dirname, 'public', 'icon.png');

sharp(input)
  .resize(256, 256)
  .png()
  .toFile(output)
  .then(() => console.log('Successfully generated icon.png'))
  .catch(err => console.error('Error generating icon:', err));
