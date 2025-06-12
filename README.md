# Majplay Local Ranking System

This project provides a small PyQt5 application used to record and display scores during offline Majplay events.

## Usage

1. Install `PyQt5` if it is not available:
   ```bash
   pip install PyQt5
   ```
2. Run the program:
   ```bash
   python main.py
   ```

Scores will be saved to `scores.json` in the current directory. You can clear all records or export them to CSV using the buttons in the interface. You can also select a row in the table and click **删除选择** to remove it.

A web-based interface is available under the `web` folder. Open `web/index.html` in your browser to manage records using HTML/CSS/JS.
