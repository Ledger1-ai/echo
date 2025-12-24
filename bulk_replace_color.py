import os
import re

def replace_color_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if '#F54029' in content:
            new_content = content.replace('#F54029', '#4dd9cf')
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False

# Process source files
extensions = ['.tsx', '.ts', '.js', '.jsx', '.html', '.css']
changed_files = []

for root, dirs, files in os.walk('src'):
    for file in files:
        if any(file.endswith(ext) for ext in extensions):
            filepath = os.path.join(root, file)
            if replace_color_in_file(filepath):
                changed_files.append(filepath)

# Process extension files
for root, dirs, files in os.walk('extension'):
    for file in files:
        if any(file.endswith(ext) for ext in extensions):
            filepath = os.path.join(root, file)
            if replace_color_in_file(filepath):
                changed_files.append(filepath)

# Process base_console.txt and replace_partial.py
for filepath in ['base_console.txt', 'replace_partial.py']:
    if os.path.exists(filepath):
        if replace_color_in_file(filepath):
            changed_files.append(filepath)

print(f"Updated {len(changed_files)} files:")
for f in changed_files:
    print(f"  - {f}")
