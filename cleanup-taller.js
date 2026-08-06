import fs from 'fs';
import path from 'path';

const filesToDelete = [
  'src/check-taller-controles.js',
  'src/fix-taller-controles.js'
];

filesToDelete.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`Deleted: ${file}`);
  }
});
