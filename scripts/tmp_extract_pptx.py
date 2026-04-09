import zipfile
import re

pptx_path = r"C:\Users\AkashK\Downloads\New folder (2)\Earth-Watch\ppt by friend\EarthWatch_v4   more new.pptx"
out_path = r"C:\Users\AkashK\Downloads\New folder (2)\Earth-Watch\tmp_extracted_ppt.txt"

with zipfile.ZipFile(pptx_path, "r") as z:
    slides = [f for f in z.namelist() if f.startswith("ppt/slides/slide") and f.endswith(".xml")]
    
    def get_slide_num(s):
        m = re.search(r'slide(\d+)\.xml', s)
        return int(m.group(1)) if m else 0
        
    slides.sort(key=get_slide_num)
    
    with open(out_path, "w", encoding="utf-8") as out:
        for slide in slides:
            xml_content = z.read(slide).decode('utf-8')
            texts = re.findall(r'<a:t[^>]*>(.*?)</a:t>', xml_content)
            if texts:
                out.write(f"--- {slide} ---\n")
                clean_texts = [t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&apos;', "'") for t in texts]
                out.write("\n".join(clean_texts) + "\n\n")
