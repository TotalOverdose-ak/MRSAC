import h5py
import json
import os

file_path = r"C:\Users\AkashK\Desktop\New folder (2)\Earth-Watch\new features\refrence\landslide4sense-solution-main\model\best_model.h5"

print("Patching best_model.h5 to be compatible with TensorFlow 2.10...")
with h5py.File(file_path, 'r+') as f:
    config_bytes = f.attrs.get('model_config')
    if config_bytes is None:
        print("No model_config found!")
        exit()
        
    config_str = config_bytes.decode('utf-8') if isinstance(config_bytes, bytes) else config_bytes
    config_dict = json.loads(config_str)

    def strip_groups(c):
        if isinstance(c, dict):
            if c.get('class_name') == 'Conv2DTranspose':
                if 'groups' in c.get('config', {}):
                    print("Stripping 'groups' from Conv2DTranspose layer.")
                    del c['config']['groups']
            for k, v in c.items():
                strip_groups(v)
        elif isinstance(c, list):
            for i in c:
                strip_groups(i)

    strip_groups(config_dict)
    f.attrs['model_config'] = json.dumps(config_dict).encode('utf-8')
    
print("Successfully patched best_model.h5!")
