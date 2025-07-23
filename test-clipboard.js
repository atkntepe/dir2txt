import clipboardy from 'clipboardy';

const testText = `Line 1: Project Structure
Line 2: Some file.js
Line 3: Another file.txt
Line 4: Content goes here
Line 5: More content`;

console.log('Testing clipboardy with multiline text...');
console.log('Original text:');
console.log(testText);
console.log('\n--- Copying to clipboard ---');

try {
  await clipboardy.write(testText);
  console.log('✅ Copy successful');
  
  // Try to read it back
  const clipboardContent = await clipboardy.read();
  console.log('\n--- Reading from clipboard ---');
  console.log('Clipboard content:');
  console.log(clipboardContent);
  
  console.log('\n--- Comparison ---');
  console.log('Original length:', testText.length);
  console.log('Clipboard length:', clipboardContent.length);
  console.log('Content matches:', testText === clipboardContent);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}