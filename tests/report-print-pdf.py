"""Render production-generated print HTML in Chrome and verify actual PDF pagination."""
from pathlib import Path
import os,subprocess,shutil,json,concurrent.futures
from PIL import Image,ImageDraw,ImageFont
import fitz
out=Path(os.environ.get('PRINT_QA_DIR','.test-output/receipt-print')).resolve();out.mkdir(parents=True,exist_ok=True)
for i,(w,h) in enumerate([(700,2400),(2200,700),(1000,1500),(600,3000),(1600,1200)],1):
    image=Image.new('RGB',(w,h),'white');draw=ImageDraw.Draw(image)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',max(22,w//28))
    draw.rectangle((8,8,w-9,h-9),outline='black',width=7)
    draw.text((25,25),f'RECEIPT {i} - TOP',fill='black',font=font)
    for n in range(1,9):draw.text((25,70+n*max(30,(h-200)//10)),f'Item {n}    125.00',fill='black',font=font)
    draw.text((25,h-80),f'BOTTOM {i} - TOTAL 1000.00',fill='black',font=font)
    image.save(out/f'receipt-{i}.png')
env={**os.environ,'PRINT_QA_DIR':str(out)}
subprocess.run(['node','--experimental-vm-modules','tests/report-print-fixtures.cjs'],env=env,check=True)
chrome=os.environ.get('CHROME_BIN') or next((shutil.which(name) for name in ['google-chrome','google-chrome-stable','chromium'] if shutil.which(name)),None)
assert chrome,'Chrome is required for real print pagination verification'
def render(source):
    target=source.with_suffix('.pdf')
    result=subprocess.run([chrome,'--headless','--no-sandbox','--disable-dev-shm-usage','--no-pdf-header-footer','--user-data-dir='+str(out/('profile-'+source.stem)),'--print-to-pdf='+str(target),source.as_uri()],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=45)
    if result.returncode or not target.exists():raise RuntimeError(source.name+': '+result.stderr.decode()[-1500:])
    return target
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:pdfs=list(pool.map(render,sorted(out.glob('review-*.html'))))
results=[]
for path in pdfs:
    count=int(path.stem.split('-')[1]);only='receipts-only' in path.stem;summary=0 if only else 1
    with fitz.open(path) as pdf:
        expected=summary+(count+1)//2
        assert len(pdf)==expected,f'{path.name}: expected {expected} pages, got {len(pdf)}'
        assert pdf[0].rect.width>pdf[0].rect.height,'Default is A4 landscape'
        for page_number in range(summary,len(pdf)):
            page=pdf[page_number];images=page.get_image_info();expected_images=min(2,count-2*(page_number-summary))
            assert len(images)==expected_images,(path.name,page_number,len(images),expected_images)
            rects=sorted([fitz.Rect(image['bbox']) for image in images],key=lambda rect:rect.x0)
            for rect in rects:
                assert rect.x0>=25 and rect.y0>=25 and rect.x1<=page.rect.width-25 and rect.y1<=page.rect.height-25,(path.name,page_number,rect)
            if len(rects)==2:assert rects[0].x1<=rects[1].x0,'Two receipt images must occupy separate columns'
        results.append({'file':path.name,'receipts':count,'pages':len(pdf),'images_per_receipt_page':[len(pdf[i].get_image_info()) for i in range(summary,len(pdf))],'passed':True})
        if path.name=='review-5.pdf':
            thumbnails=[]
            for page in pdf:
                pix=page.get_pixmap(matrix=fitz.Matrix(1,1),alpha=False);thumbnail=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);thumbnail.thumbnail((842,596));thumbnails.append(thumbnail)
            montage=Image.new('RGB',(1700,1210),'#d9ddd9')
            for i,thumbnail in enumerate(thumbnails):montage.paste(thumbnail,((i%2)*850,(i//2)*605))
            montage.save(out/'print-layout-montage.png')
(out/'print-layout-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
