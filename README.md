# Majplay Local Ranking System

This project provides a small PyQt5 application used to record and display scores during offline Majplay events.

## Usage

1. Install `PyQt5` and `qdarktheme` if they are not available:
   ```bash
   pip install PyQt5 qdarktheme
   ```
2. Run the program:
   ```bash
   python main.py
   ```

Scores will be saved to `scores.json` in the current directory. You can clear all records or export them to CSV using the buttons in the interface.
You can also select a row in the table and click **删除选择** to remove it.
The interface uses `qdarktheme` to provide a modern dark style.
