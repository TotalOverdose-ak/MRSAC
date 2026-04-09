import json
import os

nb = r"C:\Users\AkashK\Downloads\New folder (2)\Earth-Watch\scripts\Building detection.ipynb"

def read_nb(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        res = [f"--- {os.path.basename(path)} ---"]
        for cell in data.get('cells', []):
            if cell['cell_type'] in ['markdown', 'code']:
                source = ''.join(cell.get('source', []))
                res.append(f"[{cell['cell_type'].upper()}]\n{source}")
        return '\n------------\n'.join(res)
    except Exception as e:
        return f"Error reading {path}: {str(e)}"

out_path = r"C:\Users\AkashK\Downloads\New folder (2)\Earth-Watch\tmp_nb_bldg.txt"
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(read_nb(nb))
print("Done")
