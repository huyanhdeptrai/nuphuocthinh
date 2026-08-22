import sys
import json
import time
import os

sys.stdout.reconfigure(encoding='utf-8')

def run_bcut(audio_path):
    try:
        from bcut_asr import BcutASR, ResultStateEnum
        asr = BcutASR(audio_path)
        
        # Comprehensive header set to bypass Bilibili 412 WAF check
        asr.session.headers.clear()
        asr.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Referer": "https://member.bilibili.com/platform/upload-v2/video",
            "Origin": "https://member.bilibili.com",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })
        
        asr.upload()
        task_id = asr.create_task()
        
        # Poll up to 60 iterations (30 seconds)
        for _ in range(60):
            res_obj = asr.result()
            if res_obj.state == ResultStateEnum.COMPLETE:
                parsed_data = res_obj.parse()
                cues = []
                if hasattr(parsed_data, 'utterances') and parsed_data.utterances:
                    for u in parsed_data.utterances:
                        text_val = getattr(u, 'transcript', None) or getattr(u, 'text', '')
                        cues.append({
                            "id": f"bcut-{u.start_time}",
                            "startTime": u.start_time / 1000.0,
                            "endTime": u.end_time / 1000.0,
                            "text": text_val,
                            "confidence": 0.99,
                            "speaker": "Speaker 1"
                        })
                srt_str = parsed_data.to_srt() if hasattr(parsed_data, 'to_srt') else ""
                print(json.dumps({"success": True, "cues": cues, "srt": srt_str}, ensure_ascii=False))
                return
            elif res_obj.state == ResultStateEnum.ERROR:
                print(json.dumps({"success": False, "error": f"BCut Error: {res_obj.remark}"}))
                return
            time.sleep(0.5)
            
        print(json.dumps({"success": True, "cues": []}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_bcut(sys.argv[1])
    else:
        print(json.dumps({"success": False, "error": "No audio path provided"}))

