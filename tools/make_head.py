"""Crop a cut-out person PNG to a head+shoulders sprite.  usage: make_head.py cut.png out.png x0 y0 x1 y1"""
import sys
from PIL import Image
import numpy as np
from scipy import ndimage
src,out,*b=sys.argv[1:]; box=tuple(int(v) for v in b)
a=np.array(Image.open(src).convert('RGBA'))
m=a[...,3]>40; lab,k=ndimage.label(m)
keep=1+int(np.argmax(ndimage.sum(m,lab,range(1,k+1))))          # drop background people
a[...,3]=np.where(ndimage.binary_dilation(lab==keep,iterations=3),a[...,3],0)
c=Image.fromarray(a).crop(box)
c=c.resize((1057,round(1057*c.height/c.width)),Image.LANCZOS); c.save(out.rsplit('.',1)[0]+'.webp','WEBP',quality=88,method=6); print(out,c.size)
