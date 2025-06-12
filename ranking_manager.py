"""Ranking management module for Majplay local leaderboard."""

import json
import csv
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List


@dataclass
class ScoreRecord:
    player_id: str
    score: float
    song: str
    difficulty: str
    time: str


class RankingManager:
    """Handle loading, saving and updating ranking records."""

    def __init__(self, file_path: str = "scores.json"):
        self.file_path = Path(file_path)
        self.records: List[ScoreRecord] = []
        self.load_records()

    def load_records(self) -> None:
        if self.file_path.exists():
            try:
                data = json.loads(self.file_path.read_text(encoding="utf-8"))
                self.records = [ScoreRecord(**item) for item in data]
            except Exception:
                self.records = []
        else:
            self.records = []

    def save_records(self) -> None:
        data = [asdict(r) for r in self.records]
        self.file_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def add_record(self, player_id: str, score: float, song: str, difficulty: str) -> None:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_record = ScoreRecord(player_id, score, song, difficulty, now)

        replaced = False
        for i, rec in enumerate(self.records):
            if rec.player_id == player_id and rec.song == song:
                if score > rec.score:
                    self.records[i] = new_record
                replaced = True
                break
        if not replaced:
            self.records.append(new_record)
        self.sort_records()
        self.save_records()

    def sort_records(self) -> None:
        self.records.sort(key=lambda r: r.score, reverse=True)

    def clear_records(self) -> None:
        self.records.clear()
        if self.file_path.exists():
            self.file_path.unlink()

    def export_csv(self, export_path: str) -> None:
        with open(export_path, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(["排名", "玩家ID", "分数", "曲目", "难度", "时间"])
            for idx, rec in enumerate(self.records, start=1):
                writer.writerow([
                    idx,
                    rec.player_id,
                    f"{rec.score:.2f}",
                    rec.song,
                    rec.difficulty,
                    rec.time,
                ])

    def get_records(self) -> List[ScoreRecord]:
        return self.records
