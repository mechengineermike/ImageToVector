PNG to SVG Converter v3
========================

What this version is for
------------------------
This utility is tuned for:
- black artwork on white backgrounds
- script lettering
- clipart
- laser engraver assets
- transparent SVG output

Main changes in v3
------------------
- Uses a Potrace-based engine (the pure-Python `potracer` package, imported as `potrace`)
- White background is not included in the SVG
- Internal 4x upscale before tracing for smoother curves
- Lower default threshold so artwork does not come out too bold
- No preview window, by design

How to use
----------
1. Run SETUP.bat once.
2. Run RUN_PNG_TO_SVG_v3.bat.
3. Select one or more PNG files.
4. Adjust threshold only if needed.
5. Click Convert to SVG.

Threshold guidance
------------------
- Lower threshold = thinner / less bold result
- Higher threshold = thicker / darker result

Suggested starting point:
- 165 for typical AI-generated black artwork
- If still too bold, try 145 to 155
- If thin details disappear, try 175 to 190

Output behavior
---------------
Each SVG is saved beside its source PNG, using the same base filename.

Example:
C:\Art\birthday.png
becomes
C:\Art\birthday.svg

Dependencies
------------
Python packages installed by SETUP.bat:
- pillow
- numpy
- potracer

License note
------------
`potracer` is a separate dependency with its own license terms.
