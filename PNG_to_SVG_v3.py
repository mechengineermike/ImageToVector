import threading
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from PIL import Image
except ImportError:
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(
        'PNG to SVG',
        'Pillow is not installed.\n\nRun SETUP.bat once, then launch the app again.'
    )
    raise SystemExit(1)

try:
    from potrace import Bitmap, POTRACE_TURNPOLICY_MINORITY
except ImportError:
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(
        'PNG to SVG',
        'Potrace runtime is not installed.\n\n'
        'Run SETUP.bat once, then launch the app again.\n\n'
        'This utility uses the pure-Python \'potracer\' package, which is imported as \'potrace\'.'
    )
    raise SystemExit(1)


APP_TITLE = 'PNG to SVG Converter v3'
DEFAULT_THRESHOLD = 165
UPSCALE_FACTOR = 4
DEFAULT_TURDSIZE = 2


def resampling_lanczos():
    try:
        return Image.Resampling.LANCZOS
    except AttributeError:
        return Image.LANCZOS


def preprocess_for_trace(input_path: Path, scale: int):
    """
    Prepare a typical laser-engraver source:
    - flatten alpha over white
    - convert to grayscale
    - upscale 4x for smoother resulting curves
    """
    src = Image.open(input_path).convert('RGBA')
    bg = Image.new('RGBA', src.size, (255, 255, 255, 255))
    bg.alpha_composite(src)
    gray = bg.convert('L')

    if scale != 1:
        gray = gray.resize(
            (gray.width * scale, gray.height * scale),
            resampling_lanczos()
        )

    return gray, src.width, src.height


def curves_to_svg(plist, width, height, scale: int) -> str:
    def fmt(value):
        value = value / scale
        s = f'{value:.4f}'.rstrip('0').rstrip('.')
        return s if s else '0'

    parts = []
    for curve in plist:
        fs = curve.start_point
        parts.append(f'M{fmt(fs.x)},{fmt(fs.y)}')
        for segment in curve.segments:
            if segment.is_corner:
                a = segment.c
                b = segment.end_point
                parts.append(f'L{fmt(a.x)},{fmt(a.y)}L{fmt(b.x)},{fmt(b.y)}')
            else:
                a = segment.c1
                b = segment.c2
                c = segment.end_point
                parts.append(
                    f'C{fmt(a.x)},{fmt(a.y)} {fmt(b.x)},{fmt(b.y)} {fmt(c.x)},{fmt(c.y)}'
                )
        parts.append('z')

    d = ''.join(parts)
    svg_text = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg version="1.1" '
        'xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{width}" height="{height}" viewBox="0 0 {width} {height}">\n'
        f'  <path d="{d}" fill="black" stroke="none" fill-rule="evenodd"/>\n'
        '</svg>\n'
    )
    return svg_text


def vectorize_file(input_path: Path, threshold: int, turdsize: int = DEFAULT_TURDSIZE, scale: int = UPSCALE_FACTOR) -> Path:
    output_path = input_path.with_suffix('.svg')

    gray, orig_w, orig_h = preprocess_for_trace(input_path, scale)
    blacklevel = max(0.01, min(0.99, threshold / 255.0))

    bm = Bitmap(gray, blacklevel=blacklevel)
    plist = bm.trace(
        turdsize=turdsize,
        turnpolicy=POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0,
        opticurve=False,
        opttolerance=0.2,
    )

    svg_text = curves_to_svg(plist, orig_w, orig_h, scale)
    output_path.write_text(svg_text, encoding='utf-8')
    return output_path


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry('640x430')
        self.minsize(560, 380)

        self.files = []
        self.busy = False

        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        header = ttk.Frame(self, padding=(18, 18, 18, 8))
        header.grid(row=0, column=0, sticky='ew')
        header.columnconfigure(0, weight=1)

        ttk.Label(
            header,
            text='PNG → SVG',
            font=('Segoe UI', 20, 'bold')
        ).grid(row=0, column=0, sticky='w')

        ttk.Label(
            header,
            text='Potrace-based tracing for black artwork on white, optimized for laser engraver style assets.',
            font=('Segoe UI', 10)
        ).grid(row=1, column=0, sticky='w', pady=(4, 0))

        body = ttk.Frame(self, padding=(18, 8))
        body.grid(row=1, column=0, sticky='nsew')
        body.columnconfigure(0, weight=1)
        body.rowconfigure(0, weight=1)

        self.listbox = tk.Listbox(
            body,
            selectmode=tk.EXTENDED,
            font=('Segoe UI', 10),
            activestyle='none'
        )
        self.listbox.grid(row=0, column=0, sticky='nsew')

        scrollbar = ttk.Scrollbar(body, orient='vertical', command=self.listbox.yview)
        scrollbar.grid(row=0, column=1, sticky='ns')
        self.listbox.configure(yscrollcommand=scrollbar.set)

        options = ttk.LabelFrame(self, text='Tracing options', padding=(12, 8))
        options.grid(row=2, column=0, sticky='ew', padx=18, pady=(4, 4))
        options.columnconfigure(1, weight=1)

        ttk.Label(options, text='Threshold:').grid(row=0, column=0, sticky='w')
        self.threshold = tk.IntVar(value=DEFAULT_THRESHOLD)
        self.threshold_scale = ttk.Scale(
            options,
            from_=80,
            to=230,
            variable=self.threshold,
            orient='horizontal',
            command=self.on_threshold_change
        )
        self.threshold_scale.grid(row=0, column=1, sticky='ew', padx=(10, 10))
        self.threshold_label = ttk.Label(options, text=str(DEFAULT_THRESHOLD), width=4)
        self.threshold_label.grid(row=0, column=2)

        ttk.Label(
            options,
            text='Lower = thinner / less bold. Higher = thicker / darker. Default 165.',
            font=('Segoe UI', 9)
        ).grid(row=1, column=0, columnspan=3, sticky='w', pady=(5, 0))

        ttk.Label(
            options,
            text=f'Internal tracing scale is fixed at {UPSCALE_FACTOR}× for smoother curves. Output SVG background is transparent.',
            font=('Segoe UI', 9)
        ).grid(row=2, column=0, columnspan=3, sticky='w', pady=(3, 0))

        controls = ttk.Frame(self, padding=(18, 8, 18, 18))
        controls.grid(row=3, column=0, sticky='ew')
        controls.columnconfigure(2, weight=1)

        self.select_btn = ttk.Button(controls, text='Select PNGs', command=self.select_files)
        self.select_btn.grid(row=0, column=0, padx=(0, 8))

        self.clear_btn = ttk.Button(controls, text='Clear', command=self.clear_files)
        self.clear_btn.grid(row=0, column=1)

        self.convert_btn = ttk.Button(controls, text='Convert to SVG', command=self.start_conversion)
        self.convert_btn.grid(row=0, column=3, padx=(8, 0))

        self.progress = ttk.Progressbar(controls, mode='determinate')
        self.progress.grid(row=1, column=0, columnspan=4, sticky='ew', pady=(14, 6))

        self.status = ttk.Label(controls, text='Ready.')
        self.status.grid(row=2, column=0, columnspan=4, sticky='w')

    def on_threshold_change(self, _=None):
        self.threshold_label.config(text=str(int(self.threshold.get())))

    def select_files(self):
        if self.busy:
            return

        paths = filedialog.askopenfilenames(
            title='Select PNG images',
            filetypes=[('PNG images', '*.png'), ('All files', '*.*')]
        )
        if not paths:
            return

        existing = {str(p).lower() for p in self.files}
        for value in paths:
            p = Path(value)
            if str(p).lower() not in existing:
                self.files.append(p)
                existing.add(str(p).lower())
                self.listbox.insert(tk.END, str(p))

        self.status.config(text=f'{len(self.files)} image(s) selected.')

    def clear_files(self):
        if self.busy:
            return
        self.files.clear()
        self.listbox.delete(0, tk.END)
        self.progress['value'] = 0
        self.status.config(text='Ready.')

    def set_busy(self, busy: bool):
        self.busy = busy
        state = 'disabled' if busy else 'normal'
        self.select_btn.config(state=state)
        self.clear_btn.config(state=state)
        self.convert_btn.config(state=state)
        self.threshold_scale.config(state=state)

    def start_conversion(self):
        if self.busy:
            return
        if not self.files:
            messagebox.showinfo(APP_TITLE, 'Select at least one PNG first.')
            return

        self.set_busy(True)
        self.progress['maximum'] = len(self.files)
        self.progress['value'] = 0
        self.status.config(text='Converting...')
        threshold = int(self.threshold.get())

        threading.Thread(
            target=self.convert_worker,
            args=(threshold,),
            daemon=True
        ).start()

    def convert_worker(self, threshold: int):
        successes = []
        failures = []

        for index, input_path in enumerate(self.files, start=1):
            try:
                output_path = vectorize_file(input_path, threshold)
                successes.append(output_path)
            except Exception as exc:
                failures.append((input_path, str(exc)))

            self.after(0, self.update_progress, index, input_path.name)

        self.after(0, self.finish_conversion, successes, failures)

    def update_progress(self, index: int, filename: str):
        self.progress['value'] = index
        self.status.config(text=f'Processed {index}/{len(self.files)}: {filename}')

    def finish_conversion(self, successes, failures):
        self.set_busy(False)

        if not failures:
            self.status.config(text=f'Done — created {len(successes)} SVG file(s).')
            messagebox.showinfo(
                APP_TITLE,
                f'Done!\n\nCreated {len(successes)} SVG file(s) beside the PNG originals.'
            )
            return

        self.status.config(
            text=f'Finished: {len(successes)} succeeded, {len(failures)} failed.'
        )
        details = '\n'.join(f'• {p.name}: {e}' for p, e in failures[:8])
        if len(failures) > 8:
            details += f'\n...and {len(failures) - 8} more.'
        messagebox.showwarning(
            APP_TITLE,
            f'Created {len(successes)} SVG file(s).\n'
            f'{len(failures)} failed:\n\n{details}'
        )


if __name__ == '__main__':
    App().mainloop()
