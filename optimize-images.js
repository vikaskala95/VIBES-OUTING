#!/usr/bin/env node
/**
 * Image Optimization Script
 * Converts all PNG/JPG images in public/outing_pic/ to WebP format
 * Generates tiny blur placeholder data URLs
 * Resizes to appropriate dimensions for web use
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUTING_PIC_DIR = path.join(__dirname, 'public', 'outing_pic');
const CARD_WIDTH = 600;      // For trip card images
const WEBP_QUALITY = 75;     // Good balance of quality vs size
const BLUR_WIDTH = 20;       // Tiny placeholder for blur effect

async function getImageFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await getImageFiles(fullPath));
    } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function generateBlurDataURL(inputPath) {
  const buffer = await sharp(inputPath)
    .resize(BLUR_WIDTH, null, { fit: 'inside' })
    .webp({ quality: 20 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function convertImage(inputPath) {
  const dir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const webpPath = path.join(dir, `${baseName}.webp`);

  // Skip if WebP already exists and is newer
  if (fs.existsSync(webpPath)) {
    const srcStat = fs.statSync(inputPath);
    const webpStat = fs.statSync(webpPath);
    if (webpStat.mtimeMs >= srcStat.mtimeMs) {
      return { skipped: true, webpPath };
    }
  }

  const metadata = await sharp(inputPath).metadata();
  const needsResize = metadata.width > CARD_WIDTH;

  let pipeline = sharp(inputPath);
  if (needsResize) {
    pipeline = pipeline.resize(CARD_WIDTH, null, { 
      fit: 'inside', 
      withoutEnlargement: true 
    });
  }

  await pipeline.webp({ quality: WEBP_QUALITY }).toFile(webpPath);

  const originalSize = fs.statSync(inputPath).size;
  const webpSize = fs.statSync(webpPath).size;
  const savings = ((1 - webpSize / originalSize) * 100).toFixed(1);

  return { 
    skipped: false, 
    webpPath, 
    originalSize, 
    webpSize, 
    savings,
    resized: needsResize,
    originalWidth: metadata.width 
  };
}

async function main() {
  console.log('🔍 Scanning for images in', OUTING_PIC_DIR);
  const imageFiles = await getImageFiles(OUTING_PIC_DIR);
  console.log(`📸 Found ${imageFiles.length} images to process\n`);

  let totalOriginal = 0;
  let totalWebp = 0;
  let converted = 0;
  let skipped = 0;
  const blurPlaceholders = {};

  for (const file of imageFiles) {
    const relativePath = path.relative(path.join(__dirname, 'public'), file);
    try {
      // Convert to WebP
      const result = await convertImage(file);
      if (result.skipped) {
        skipped++;
        console.log(`⏭️  Skipped (already exists): ${relativePath}`);
      } else {
        converted++;
        totalOriginal += result.originalSize;
        totalWebp += result.webpSize;
        const origMB = (result.originalSize / 1024 / 1024).toFixed(2);
        const webpKB = (result.webpSize / 1024).toFixed(0);
        console.log(`✅ ${relativePath} → ${origMB}MB → ${webpKB}KB (${result.savings}% smaller${result.resized ? `, resized from ${result.originalWidth}px` : ''})`);
      }

      // Generate blur placeholder
      const webpRelative = relativePath.replace(/\.(png|jpe?g)$/i, '.webp');
      const blurDataURL = await generateBlurDataURL(file);
      // Store with the /outing_pic/... path as key
      blurPlaceholders['/' + webpRelative.replace(/\\/g, '/')] = blurDataURL;

    } catch (err) {
      console.error(`❌ Failed: ${relativePath} - ${err.message}`);
    }
  }

  // Save blur placeholders JSON
  const blurPath = path.join(__dirname, 'public', 'blur-placeholders.json');
  fs.writeFileSync(blurPath, JSON.stringify(blurPlaceholders, null, 2));
  console.log(`\n💾 Blur placeholders saved to public/blur-placeholders.json`);

  // Summary
  const totalOrigMB = (totalOriginal / 1024 / 1024).toFixed(2);
  const totalWebpMB = (totalWebp / 1024 / 1024).toFixed(2);
  const totalSavings = totalOriginal > 0 ? ((1 - totalWebp / totalOriginal) * 100).toFixed(1) : 0;

  console.log('\n📊 Summary:');
  console.log(`   Converted: ${converted} images`);
  console.log(`   Skipped: ${skipped} images`);
  console.log(`   Original total: ${totalOrigMB} MB`);
  console.log(`   WebP total: ${totalWebpMB} MB`);
  console.log(`   Total savings: ${totalSavings}%`);
}

main().catch(console.error);
