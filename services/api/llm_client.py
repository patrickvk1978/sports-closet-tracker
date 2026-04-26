from __future__ import annotations

import json
import os
from typing import Any


DEFAULT_OPENAI_MODEL = 'gpt-5.5'


def resolve_provider(model: str | None = None) -> str:
    provider = (os.environ.get('LLM_PROVIDER') or '').strip().lower()
    if provider in {'openai', 'anthropic'}:
        return provider

    model_name = (model or '').strip().lower()
    if model_name.startswith('claude'):
        return 'anthropic'
    if model_name.startswith(('gpt-', 'o1', 'o3', 'o4')):
        return 'openai'

    if os.environ.get('OPENAI_API_KEY'):
        return 'openai'
    if os.environ.get('ANTHROPIC_API_KEY'):
        return 'anthropic'
    return 'openai'


def resolve_model(model: str | None = None) -> str:
    if model:
        return model
    configured = (os.environ.get('OPENAI_MODEL') or '').strip()
    return configured or DEFAULT_OPENAI_MODEL


def ensure_api_key(provider: str) -> str:
    env_var = 'OPENAI_API_KEY' if provider == 'openai' else 'ANTHROPIC_API_KEY'
    api_key = os.environ.get(env_var, '').strip()
    if not api_key:
        raise RuntimeError(f'{env_var} not set')
    return api_key


def generate_structured_json(
    *,
    model: str | None,
    instructions: str,
    input_text: str,
    json_schema: dict[str, Any] | None,
    schema_name: str,
    max_output_tokens: int,
) -> dict[str, Any]:
    provider = resolve_provider(model)
    resolved_model = resolve_model(model)

    if provider == 'openai':
        return _generate_openai_structured_json(
            model=resolved_model,
            instructions=instructions,
            input_text=input_text,
            json_schema=json_schema,
            schema_name=schema_name,
            max_output_tokens=max_output_tokens,
        )

    return _generate_anthropic_structured_json(
        model=resolved_model,
        instructions=instructions,
        input_text=input_text,
        max_output_tokens=max_output_tokens,
    )


def _generate_openai_structured_json(
    *,
    model: str,
    instructions: str,
    input_text: str,
    json_schema: dict[str, Any] | None,
    schema_name: str,
    max_output_tokens: int,
) -> dict[str, Any]:
    from openai import OpenAI

    client = OpenAI(api_key=ensure_api_key('openai'))
    text_config: dict[str, Any] = {'verbosity': 'low'}
    if json_schema:
        text_config['format'] = {
            'type': 'json_schema',
            'name': schema_name,
            'strict': True,
            'schema': json_schema,
        }
    else:
        text_config['format'] = {'type': 'json_object'}

    response = client.responses.create(
        model=model,
        instructions=instructions,
        input=input_text,
        max_output_tokens=max_output_tokens,
        text=text_config,
        store=False,
    )
    raw = (getattr(response, 'output_text', '') or _extract_openai_text(response)).strip()
    if not raw:
        refusal = _extract_openai_refusal(response)
        if refusal:
            raise RuntimeError(f'OpenAI refusal: {refusal}')
        raise RuntimeError('OpenAI response was empty')

    return {
        'provider': 'openai',
        'raw': raw,
        'parsed': json.loads(raw),
        'usage': _normalize_openai_usage(getattr(response, 'usage', None)),
    }


def _generate_anthropic_structured_json(
    *,
    model: str,
    instructions: str,
    input_text: str,
    max_output_tokens: int,
) -> dict[str, Any]:
    import anthropic

    client = anthropic.Anthropic(api_key=ensure_api_key('anthropic'))
    response = client.messages.create(
        model=model,
        max_tokens=max_output_tokens,
        system=[{
            'type': 'text',
            'text': instructions,
            'cache_control': {'type': 'ephemeral'},
        }],
        messages=[{'role': 'user', 'content': input_text}],
    )
    raw = _strip_code_fences(response.content[0].text.strip())
    return {
        'provider': 'anthropic',
        'raw': raw,
        'parsed': json.loads(raw),
        'usage': {
            'input_tokens': getattr(response.usage, 'input_tokens', 0),
            'output_tokens': getattr(response.usage, 'output_tokens', 0),
            'cache_read_tokens': getattr(response.usage, 'cache_read_input_tokens', 0),
            'cache_creation_tokens': getattr(response.usage, 'cache_creation_input_tokens', 0),
        },
    }


def _strip_code_fences(raw: str) -> str:
    if raw.startswith('```'):
        return raw.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
    return raw


def _extract_openai_text(response: Any) -> str:
    chunks: list[str] = []
    for output in getattr(response, 'output', []) or []:
        if getattr(output, 'type', None) != 'message':
            continue
        for item in getattr(output, 'content', []) or []:
            item_type = getattr(item, 'type', None)
            if item_type == 'output_text':
                chunks.append(getattr(item, 'text', ''))
            elif item_type == 'text':
                chunks.append(getattr(item, 'text', ''))
    return ''.join(chunks)


def _extract_openai_refusal(response: Any) -> str:
    for output in getattr(response, 'output', []) or []:
        if getattr(output, 'type', None) != 'message':
            continue
        for item in getattr(output, 'content', []) or []:
            if getattr(item, 'type', None) == 'refusal':
                return getattr(item, 'refusal', '')
    return ''


def _normalize_openai_usage(usage: Any) -> dict[str, int]:
    if usage is None:
        return {
            'input_tokens': 0,
            'output_tokens': 0,
            'cache_read_tokens': 0,
            'cache_creation_tokens': 0,
        }
    return {
        'input_tokens': getattr(usage, 'input_tokens', 0),
        'output_tokens': getattr(usage, 'output_tokens', 0),
        'cache_read_tokens': 0,
        'cache_creation_tokens': 0,
    }
