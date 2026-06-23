import os

from jinja2 import Environment, FileSystemLoader


def load_agent_instructions() -> str:
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompt-template")
    env = Environment(loader=FileSystemLoader(template_dir))
    try:
        table_structure = env.get_template("google_trends_table_structure.j2").render()
        few_shots = env.get_template("google_trends_few_shots.j2").render()
        return f"{table_structure}\n\n{few_shots}"
    except Exception as e:  # noqa: BLE001
        return f"You are an agent that can query Google Trends data. Error loading prompts: {e}"
